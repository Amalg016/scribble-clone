package game

import (
	"testing"
)

func TestDuplicateNicknameInRoom(t *testing.T) {
	p1 := &Player{ID: "p1", Name: "Alice"}
	room := NewRoom("ABCD", p1)

	err := room.AddPlayer(p1)
	if err != nil {
		t.Fatalf("expected first player addition to succeed, got: %v", err)
	}

	// Case 1: Exact match duplicate nickname
	p2 := &Player{ID: "p2", Name: "Alice"}
	err = room.AddPlayer(p2)
	if err == nil {
		t.Errorf("expected error for duplicate nickname 'Alice', got nil")
	}

	// Case 2: Case-insensitive duplicate nickname
	p3 := &Player{ID: "p3", Name: "aLiCe"}
	err = room.AddPlayer(p3)
	if err == nil {
		t.Errorf("expected error for duplicate nickname 'aLiCe', got nil")
	}

	// Case 3: Different nickname
	p4 := &Player{ID: "p4", Name: "Bob"}
	err = room.AddPlayer(p4)
	if err != nil {
		t.Errorf("expected player with nickname 'Bob' to be added successfully, got: %v", err)
	}
}
