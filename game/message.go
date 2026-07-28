package game

// Base message structure
type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// DrawAction represents a drawing action
type DrawAction struct {
	PrevX float64 `json:"prevX"`
	PrevY float64 `json:"prevY"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Color string  `json:"color"`
	Size  int     `json:"size"`
}

// PlayerInfo represents a player in the room
type PlayerInfo struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Score int    `json:"score"`
	Host  bool   `json:"host"`
}

// GameState represents the current state of the game
type GameState struct {
	State      string `json:"state"`
	Round      int    `json:"round"`
	MaxRounds  int    `json:"maxRounds"`
	DrawerID   string `json:"drawerId"`
	Timer      int    `json:"timer"`
}

// Payload structs
type CreateRoomPayload struct {
	Name string `json:"name"`
}

type JoinRoomPayload struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type SelectWordPayload struct {
	Word string `json:"word"`
}

type ChatPayload struct {
	Message string `json:"message"`
}

type RoomJoinedPayload struct {
	PlayerID string       `json:"playerId"`
	HostID   string       `json:"hostId"`
	Code     string       `json:"code"`
	Players  []PlayerInfo `json:"players"`
	Game     *GameState   `json:"game"` // Can be nil if game hasn't started
}

type PlayerJoinedPayload struct {
	Players []PlayerInfo `json:"players"`
}

type PlayerLeftPayload struct {
	Players []PlayerInfo `json:"players"`
	HostID  string       `json:"hostId"`
}

type NewRoundPayload struct {
	Round      int    `json:"round"`
	MaxRounds  int    `json:"maxRounds"`
	DrawerID   string `json:"drawerId"`
}

type WordOptionsPayload struct {
	Options []string `json:"options"`
}

type YourWordPayload struct {
	Word string `json:"word"`
}

type WordHintPayload struct {
	Hint string `json:"hint"`
}

type DrawHistoryPayload struct {
	Actions []DrawAction `json:"actions"`
}

type ChatBroadcastPayload struct {
	PlayerID  string         `json:"playerId"`
	Name      string         `json:"name"`
	Message   string         `json:"message"`
	IsDrawer  bool           `json:"isDrawer"`
	IsCorrect bool           `json:"isCorrect"`
	Scores    map[string]int `json:"scores,omitempty"`
}

type TimerPayload struct {
	Time int `json:"time"`
}

type RoundEndedPayload struct {
	Word     string         `json:"word"`
	DrawerID string         `json:"drawerId"`
	Scores   map[string]int `json:"scores"`
}

type GameOverPayload struct {
	Scores map[string]int `json:"scores"`
}

type ErrorPayload struct {
	Message string `json:"message"`
}
