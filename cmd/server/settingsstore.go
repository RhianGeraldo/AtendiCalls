package main

import (
	"context"
	"sync"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SystemSetting struct {
	Key   string `gorm:"primaryKey;column:key" json:"key"`
	Value string `gorm:"type:text;column:value" json:"value"`
}

func (SystemSetting) TableName() string {
	return "system_settings"
}

type settingsStore struct {
	db *gorm.DB
	mu sync.RWMutex
}

func newSettingsStore(ctx context.Context, db *gorm.DB) (*settingsStore, error) {
	if err := db.WithContext(ctx).AutoMigrate(&SystemSetting{}); err != nil {
		return nil, err
	}
	return &settingsStore{db: db}, nil
}

func (s *settingsStore) Get(ctx context.Context, key string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var setting SystemSetting
	err := s.db.WithContext(ctx).Where(&SystemSetting{Key: key}).First(&setting).Error
	if err != nil {
		return "", err
	}
	return setting.Value, nil
}

func (s *settingsStore) Set(ctx context.Context, key, val string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	setting := SystemSetting{
		Key:   key,
		Value: val,
	}
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value"}),
	}).Create(&setting).Error
}

func (s *settingsStore) GetAll(ctx context.Context) (map[string]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var settings []SystemSetting
	if err := s.db.WithContext(ctx).Find(&settings).Error; err != nil {
		return nil, err
	}

	res := make(map[string]string)
	for _, st := range settings {
		res[st.Key] = st.Value
	}
	return res, nil
}
