package game

import (
	"context"
	"encoding/json"
	"math/rand"
	"strings"
	"sync"
	"time"
)

type Room struct {
	Code            string
	Players         map[string]*Player
	Host            *Player
	mu              sync.Mutex
	State           string // waiting, picking, drawing, round_end, game_over
	Round           int
	MaxRounds       int
	CurrentDrawer   *Player
	CurrentWord     string
	DrawerIndex     int
	PlayerOrder     []string
	DrawHistory     []DrawAction
	timerCancel     context.CancelFunc
	timeLeft        int
	CorrectGuessers map[string]bool
	WordOptions     []string
	RoundStartTime  time.Time
	HintTimerCancel context.CancelFunc
}

func NewRoom(code string, host *Player) *Room {
	return &Room{
		Code:            code,
		Players:         make(map[string]*Player),
		Host:            host,
		State:           "waiting",
		MaxRounds:       3,
		DrawHistory:     make([]DrawAction, 0),
		CorrectGuessers: make(map[string]bool),
	}
}

func (r *Room) getPlayerInfoList() []PlayerInfo {
	list := make([]PlayerInfo, 0, len(r.Players))
	for _, p := range r.Players {
		list = append(list, PlayerInfo{
			ID:    p.ID,
			Name:  p.Name,
			Score: p.Score,
			Host:  p == r.Host,
		})
	}
	return list
}

func (r *Room) AddPlayer(p *Player) {
	r.mu.Lock()
	defer r.mu.Unlock()

	p.Room = r
	r.Players[p.ID] = p
	if !contains(r.PlayerOrder, p.ID) {
		r.PlayerOrder = append(r.PlayerOrder, p.ID)
	}

	var gameState *GameState
	if r.State != "waiting" {
		drawerID := ""
		if r.CurrentDrawer != nil {
			drawerID = r.CurrentDrawer.ID
		}
		gameState = &GameState{
			State:     r.State,
			Round:     r.Round,
			MaxRounds: r.MaxRounds,
			DrawerID:  drawerID,
			Timer:     r.timeLeft,
		}
	}

	playersList := r.getPlayerInfoList()

	hostID := ""
	if r.Host != nil {
		hostID = r.Host.ID
	}

	p.SendJSON(Message{
		Type: "room_joined",
		Payload: RoomJoinedPayload{
			PlayerID: p.ID,
			HostID:   hostID,
			Code:     r.Code,
			Players:  playersList,
			Game:     gameState,
		},
	})

	r.broadcastExcept(Message{
		Type: "player_joined",
		Payload: PlayerJoinedPayload{
			Players: playersList,
		},
	}, p.ID)

	if len(r.DrawHistory) > 0 {
		p.SendJSON(Message{
			Type: "draw_history",
			Payload: DrawHistoryPayload{
				Actions: r.DrawHistory,
			},
		})
	}
}

func (r *Room) RemovePlayer(p *Player) {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.Players, p.ID)
	for i, id := range r.PlayerOrder {
		if id == p.ID {
			r.PlayerOrder = append(r.PlayerOrder[:i], r.PlayerOrder[i+1:]...)
			if i < r.DrawerIndex {
				r.DrawerIndex--
			}
			break
		}
	}

	if len(r.Players) == 0 {
		if r.timerCancel != nil {
			r.timerCancel()
		}
		if r.HintTimerCancel != nil {
			r.HintTimerCancel()
		}
		GlobalHub.RemoveRoom(r.Code)
		return
	}

	if r.Host == p {
		for _, nextP := range r.Players {
			r.Host = nextP
			break
		}
	}

	playersList := r.getPlayerInfoList()
	r.broadcast(Message{
		Type: "player_left",
		Payload: PlayerLeftPayload{
			Players: playersList,
			HostID:  r.Host.ID,
		},
	})

	if r.State != "waiting" && r.State != "game_over" {
		delete(r.CorrectGuessers, p.ID)
		if r.CurrentDrawer == p {
			go r.EndRound()
		} else if len(r.CorrectGuessers) == len(r.Players)-1 && len(r.Players) > 1 {
			go r.EndRound()
		}
	}
}

func (r *Room) broadcast(msg Message) {
	for _, p := range r.Players {
		p.SendJSON(msg)
	}
}

func (r *Room) broadcastExcept(msg Message, excludeID string) {
	for _, p := range r.Players {
		if p.ID != excludeID {
			p.SendJSON(msg)
		}
	}
}

func (r *Room) HandleMessage(p *Player, msg Message, raw []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()

	switch msg.Type {
	case "start_game":
		if p == r.Host && r.State == "waiting" && len(r.Players) >= 2 {
			r.State = "picking"
			r.Round = 1
			r.DrawerIndex = -1
			for _, pl := range r.Players {
				pl.Score = 0
			}
			r.broadcast(Message{Type: "game_started", Payload: map[string]interface{}{}})
			go r.StartRound()
		}
	case "select_word":
		if r.State == "picking" && r.CurrentDrawer == p {
			var wrapper struct {
				Payload SelectWordPayload `json:"payload"`
			}
			json.Unmarshal(raw, &wrapper)
			word := wrapper.Payload.Word

			valid := false
			for _, w := range r.WordOptions {
				if w == word {
					valid = true
					break
				}
			}
			if !valid && len(r.WordOptions) > 0 {
				word = r.WordOptions[0]
			}
			r.selectWordLocked(word)
		}
	case "draw":
		if r.State == "drawing" && r.CurrentDrawer == p {
			var wrapper struct {
				Payload DrawAction `json:"payload"`
			}
			json.Unmarshal(raw, &wrapper)
			r.DrawHistory = append(r.DrawHistory, wrapper.Payload)
			r.broadcastExcept(msg, p.ID)
		}
	case "clear_canvas":
		if r.State == "drawing" && r.CurrentDrawer == p {
			r.DrawHistory = make([]DrawAction, 0)
			r.broadcast(msg)
		}
	case "chat":
		var wrapper struct {
			Payload ChatPayload `json:"payload"`
		}
		json.Unmarshal(raw, &wrapper)
		msgText := wrapper.Payload.Message

		isDrawer := r.CurrentDrawer == p
		isCorrect := false

		if r.State == "drawing" && !isDrawer {
			if strings.EqualFold(strings.TrimSpace(msgText), r.CurrentWord) {
				if !r.CorrectGuessers[p.ID] {
					isCorrect = true
					r.CorrectGuessers[p.ID] = true

					elapsed := int(time.Since(r.RoundStartTime).Seconds())
					points := 500 - (elapsed * 6)
					if points < 50 {
						points = 50
					}
					p.Score += points
					if r.CurrentDrawer != nil {
						r.CurrentDrawer.Score += 50
					}

					scores := make(map[string]int)
					for _, pl := range r.Players {
						scores[pl.ID] = pl.Score
					}

					r.broadcast(Message{
						Type: "chat",
						Payload: ChatBroadcastPayload{
							PlayerID:  p.ID,
							Name:      p.Name,
							Message:   "guessed the word!",
							IsDrawer:  false,
							IsCorrect: true,
							Scores:    scores,
						},
					})

					if len(r.CorrectGuessers) >= len(r.Players)-1 && len(r.Players) > 1 {
						go r.EndRound()
					}
					return
				}
			}
		}

		if !isCorrect {
			r.broadcast(Message{
				Type: "chat",
				Payload: ChatBroadcastPayload{
					PlayerID:  p.ID,
					Name:      p.Name,
					Message:   msgText,
					IsDrawer:  isDrawer,
					IsCorrect: false,
				},
			})
		}
	}
}

func (r *Room) StartRound() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.State = "picking"
	r.DrawerIndex++
	if r.DrawerIndex >= len(r.PlayerOrder) {
		r.DrawerIndex = 0
		r.Round++
		if r.Round > r.MaxRounds {
			r.endGameLocked()
			return
		}
	}

	drawerID := r.PlayerOrder[r.DrawerIndex]
	r.CurrentDrawer = r.Players[drawerID]
	r.DrawHistory = make([]DrawAction, 0)
	r.CorrectGuessers = make(map[string]bool)

	r.broadcast(Message{
		Type: "new_round",
		Payload: NewRoundPayload{
			Round:     r.Round,
			MaxRounds: r.MaxRounds,
			DrawerID:  drawerID,
		},
	})
	r.broadcast(Message{Type: "clear_canvas", Payload: map[string]interface{}{}})

	r.WordOptions = GetRandomWords(3)
	if r.CurrentDrawer != nil {
		r.CurrentDrawer.SendJSON(Message{
			Type: "word_options",
			Payload: WordOptionsPayload{
				Options: r.WordOptions,
			},
		})
	}

	r.startTimer(15, func() {
		r.mu.Lock()
		defer r.mu.Unlock()
		if r.State == "picking" {
			word := "word"
			if len(r.WordOptions) > 0 {
				word = r.WordOptions[0]
			}
			r.selectWordLocked(word)
		}
	})
}

func (r *Room) selectWordLocked(word string) {
	r.State = "drawing"
	r.CurrentWord = word
	r.RoundStartTime = time.Now()

	if r.CurrentDrawer != nil {
		r.CurrentDrawer.SendJSON(Message{
			Type: "your_word",
			Payload: YourWordPayload{
				Word: word,
			},
		})
	}

	r.sendWordHintLocked()

	r.startTimer(80, func() {
		go r.EndRound()
	})

	r.startHintTimer()
}

func (r *Room) sendWordHintLocked() {
	hint := ""
	for _, char := range r.CurrentWord {
		if char == ' ' {
			hint += "  "
		} else {
			hint += "_ "
		}
	}
	hint = strings.TrimSpace(hint)

	msg := Message{
		Type: "word_hint",
		Payload: WordHintPayload{
			Hint: hint,
		},
	}

	for _, p := range r.Players {
		if p != r.CurrentDrawer {
			p.SendJSON(msg)
		}
	}
}

func (r *Room) startHintTimer() {
	if r.HintTimerCancel != nil {
		r.HintTimerCancel()
	}

	ctx, cancel := context.WithCancel(context.Background())
	r.HintTimerCancel = cancel

	go func() {
		wordLength := len(r.CurrentWord)
		revealed := make([]bool, wordLength)
		for i, c := range r.CurrentWord {
			if c == ' ' {
				revealed[i] = true
			}
		}

		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				r.mu.Lock()
				if r.State != "drawing" {
					r.mu.Unlock()
					return
				}

				unrevealed := []int{}
				for i, v := range revealed {
					if !v {
						unrevealed = append(unrevealed, i)
					}
				}

				if len(unrevealed) > 1 {
					idx := unrevealed[rand.Intn(len(unrevealed))]
					revealed[idx] = true

					hint := ""
					for i, char := range r.CurrentWord {
						if revealed[i] {
							hint += string(char) + " "
						} else {
							hint += "_ "
						}
					}
					hint = strings.TrimSpace(hint)

					msg := Message{
						Type: "word_hint",
						Payload: WordHintPayload{
							Hint: hint,
						},
					}

					for _, p := range r.Players {
						if p != r.CurrentDrawer {
							p.SendJSON(msg)
						}
					}
				}
				r.mu.Unlock()
			}
		}
	}()
}

func (r *Room) EndRound() {
	r.mu.Lock()

	if r.State != "drawing" && r.State != "picking" {
		r.mu.Unlock()
		return
	}

	if r.timerCancel != nil {
		r.timerCancel()
	}
	if r.HintTimerCancel != nil {
		r.HintTimerCancel()
	}

	r.State = "round_end"

	scores := make(map[string]int)
	for _, p := range r.Players {
		scores[p.ID] = p.Score
	}

	drawerID := ""
	if r.CurrentDrawer != nil {
		drawerID = r.CurrentDrawer.ID
	}

	r.broadcast(Message{
		Type: "round_ended",
		Payload: RoundEndedPayload{
			Word:     r.CurrentWord,
			DrawerID: drawerID,
			Scores:   scores,
		},
	})

	r.mu.Unlock()

	time.Sleep(3 * time.Second)

	r.mu.Lock()
	if len(r.Players) < 2 {
		r.endGameLocked()
		r.mu.Unlock()
		return
	}
	r.mu.Unlock()

	r.StartRound()
}

func (r *Room) endGameLocked() {
	r.State = "game_over"
	scores := make(map[string]int)
	for _, p := range r.Players {
		scores[p.ID] = p.Score
	}

	r.broadcast(Message{
		Type: "game_over",
		Payload: GameOverPayload{
			Scores: scores,
		},
	})

	r.State = "waiting"
	r.Round = 0
	r.CurrentDrawer = nil
	r.CurrentWord = ""
	r.DrawHistory = make([]DrawAction, 0)
}

func (r *Room) startTimer(seconds int, onExpire func()) {
	if r.timerCancel != nil {
		r.timerCancel()
	}

	ctx, cancel := context.WithCancel(context.Background())
	r.timerCancel = cancel
	r.timeLeft = seconds

	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()

		for {
			r.mu.Lock()
			r.broadcast(Message{
				Type: "timer",
				Payload: TimerPayload{
					Time: r.timeLeft,
				},
			})
			r.mu.Unlock()

			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				r.mu.Lock()
				r.timeLeft--
				timeLeft := r.timeLeft
				r.mu.Unlock()

				if timeLeft <= 0 {
					onExpire()
					return
				}
			}
		}
	}()
}

func contains(slice []string, val string) bool {
	for _, item := range slice {
		if item == val {
			return true
		}
	}
	return false
}
