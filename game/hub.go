package game

import (
	"crypto/rand"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Hub struct {
	rooms   map[string]*Room
	roomsMu sync.RWMutex
}

var GlobalHub *Hub

func NewHub() *Hub {
	GlobalHub = &Hub{
		rooms: make(map[string]*Room),
	}
	return GlobalHub
}

func generateRoomCode() string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	b := make([]byte, 4)
	for {
		rand.Read(b)
		for i := 0; i < 4; i++ {
			b[i] = charset[int(b[i])%len(charset)]
		}
		code := string(b)
		GlobalHub.roomsMu.RLock()
		_, exists := GlobalHub.rooms[code]
		GlobalHub.roomsMu.RUnlock()
		if !exists {
			return code
		}
	}
}

func (h *Hub) CreateRoom(host *Player) *Room {
	code := generateRoomCode()
	room := NewRoom(code, host)
	h.roomsMu.Lock()
	h.rooms[code] = room
	h.roomsMu.Unlock()
	return room
}

func (h *Hub) GetRoom(code string) *Room {
	h.roomsMu.RLock()
	defer h.roomsMu.RUnlock()
	return h.rooms[strings.ToUpper(code)]
}

func (h *Hub) RemoveRoom(code string) {
	h.roomsMu.Lock()
	defer h.roomsMu.Unlock()
	delete(h.rooms, code)
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade error: %v", err)
		return
	}

	player := NewPlayer(conn)
	go player.ReadPump(h)
}

func (h *Hub) HandleInitialMessage(p *Player, msg Message, raw []byte) {
	switch msg.Type {
	case "create_room":
		var wrapper struct {
			Payload CreateRoomPayload `json:"payload"`
		}
		json.Unmarshal(raw, &wrapper)
		p.Name = strings.TrimSpace(wrapper.Payload.Name)
		if p.Name == "" {
			p.Name = "Player"
		}
		room := h.CreateRoom(p)
		if err := room.AddPlayer(p); err != nil {
			p.SendJSON(Message{Type: "error", Payload: ErrorPayload{Message: err.Error()}})
			return
		}

	case "join_room":
		var wrapper struct {
			Payload JoinRoomPayload `json:"payload"`
		}
		json.Unmarshal(raw, &wrapper)
		p.Name = strings.TrimSpace(wrapper.Payload.Name)
		if p.Name == "" {
			p.Name = "Player"
		}
		room := h.GetRoom(wrapper.Payload.Code)
		if room == nil {
			p.SendJSON(Message{Type: "error", Payload: ErrorPayload{Message: "Room not found"}})
			return
		}
		if err := room.AddPlayer(p); err != nil {
			p.SendJSON(Message{Type: "error", Payload: ErrorPayload{Message: err.Error()}})
			return
		}
	}
}
