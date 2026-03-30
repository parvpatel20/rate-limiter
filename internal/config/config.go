package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
)

const defaultEnvFile = ".env"

type Config struct {
	RedisURL     string
	PoliciesFile string
	Port         string
	FailureMode  string
	AdminSecret  string
	AppEnv       string
}

func Load() (Config, error) {
	return LoadFromFile(defaultEnvFile)
}

func LoadFromFile(envFile string) (Config, error) {
	if envFile != "" {
		if _, err := os.Stat(envFile); err == nil {
			if err := godotenv.Load(envFile); err != nil {
				return Config{}, fmt.Errorf("load %s: %w", filepath.Base(envFile), err)
			}
		}
	}

	cfg := Config{
		RedisURL:     os.Getenv("REDIS_URL"),
		PoliciesFile: os.Getenv("POLICIES_FILE"),
		Port:         os.Getenv("PORT"),
		FailureMode:  strings.ToLower(os.Getenv("FAILURE_MODE")),
		AdminSecret:  os.Getenv("ADMIN_SECRET"),
		AppEnv:       strings.ToLower(os.Getenv("APP_ENV")),
	}

	if cfg.RedisURL == "" {
		return Config{}, fmt.Errorf("REDIS_URL is required")
	}
	if cfg.PoliciesFile == "" {
		return Config{}, fmt.Errorf("POLICIES_FILE is required")
	}
	if cfg.Port == "" {
		return Config{}, fmt.Errorf("PORT is required")
	}
	if cfg.FailureMode == "" {
		cfg.FailureMode = "open"
	}
	if cfg.FailureMode != "open" && cfg.FailureMode != "closed" {
		return Config{}, fmt.Errorf("FAILURE_MODE must be open or closed")
	}
	if cfg.AppEnv == "" {
		cfg.AppEnv = "development"
	}

	return cfg, nil
}
