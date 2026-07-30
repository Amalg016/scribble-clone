package game

import (
	"encoding/json"
	"math/rand"
	"os"
	"sync"
	"time"
)

type WordsData struct {
	Easy   []string `json:"easy"`
	Medium []string `json:"medium"`
	Hard   []string `json:"hard"`
}

var (
	allWords []string
	wordsMu  sync.RWMutex
	rng      *rand.Rand
)

func init() {
	rng = rand.New(rand.NewSource(time.Now().UnixNano()))
}

func LoadWords(filepath string) {
	data, err := os.ReadFile(filepath)
	if err != nil {
		allWords = []string{"apple", "banana", "car", "dog", "elephant"}
		return
	}

	var words WordsData
	if err := json.Unmarshal(data, &words); err != nil {
		allWords = []string{"apple", "banana", "car", "dog", "elephant"}
		return
	}

	wordsMu.Lock()
	defer wordsMu.Unlock()
	allWords = append(allWords, words.Easy...)
	allWords = append(allWords, words.Medium...)
	allWords = append(allWords, words.Hard...)
}

func GetRandomWords(n int, exclude map[string]bool) []string {
	wordsMu.RLock()
	defer wordsMu.RUnlock()

	if len(allWords) == 0 {
		return []string{"word"}
	}

	// Build a pool of available (non-excluded) words
	available := make([]string, 0, len(allWords))
	for _, w := range allWords {
		if !exclude[w] {
			available = append(available, w)
		}
	}

	// If all words have been used, reset to the full pool
	if len(available) == 0 {
		available = allWords
	}

	if n > len(available) {
		n = len(available)
	}

	perm := rng.Perm(len(available))
	result := make([]string, n)
	for i := 0; i < n; i++ {
		result[i] = available[perm[i]]
	}
	return result
}
