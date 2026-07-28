package main

import (
	"log"
	"net/http"
	"os"
	"scribble-game/game"
)

func main() {
	game.LoadWords("data/words.json")
	hub := game.NewHub()

	http.HandleFunc("/ws", hub.HandleWebSocket)
	http.Handle("/", http.FileServer(http.Dir("public")))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
