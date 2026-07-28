package game

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

type Player struct {
	ID      string
	Name    string
	Score   int
	Conn    *websocket.Conn
	Room    *Room
	writeMu sync.Mutex
}

func GenerateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func NewPlayer(conn *websocket.Conn) *Player {
	return &Player{
		ID:    GenerateID(),
		Conn:  conn,
		Score: 0,
	}
}

func (p *Player) SendJSON(msg interface{}) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	return p.Conn.WriteJSON(msg)
}

func (p *Player) ReadPump(hub *Hub) {
	defer func() {
		if p.Room != nil {
			p.Room.RemovePlayer(p)
		}
		p.Conn.Close()
	}()

	for {
		_, raw, err := p.Conn.ReadMessage()
		if err != nil {
			break
		}

		var msg Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			log.Printf("json unmarshal error: %v", err)
			continue
		}

		if p.Room != nil {
			p.Room.HandleMessage(p, msg, raw)
		} else {
			hub.HandleInitialMessage(p, msg, raw)
		}
	}
}
