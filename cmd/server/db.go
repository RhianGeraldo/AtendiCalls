package main

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"database/sql"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type DatabaseConfig struct {
	GormDB      *gorm.DB
	SqlDB       *sql.DB
	DialectName string // "sqlite3", "postgres", "mysql"
}

func initGORM(dsn string, debug bool) (*DatabaseConfig, error) {
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn == "" {
		dsn = "atendicalls.db"
	}

	var dialector gorm.Dialector
	var dialectName string

	logLevel := logger.Warn
	if debug {
		logLevel = logger.Info
	}

	gormLogger := logger.New(
		slog.NewLogLogger(slog.Default().Handler(), slog.LevelDebug),
		logger.Config{
			SlowThreshold:             200 * time.Millisecond,
			LogLevel:                  logLevel,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	)

	switch {
	case strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://"):
		dialector = postgres.Open(dsn)
		dialectName = "postgres"
	case strings.Contains(dsn, "@tcp(") || strings.HasPrefix(dsn, "mysql://"):
		cleanDSN := strings.TrimPrefix(dsn, "mysql://")
		dialector = mysql.Open(cleanDSN)
		dialectName = "mysql"
	default:
		sqliteDSN := dsn
		if !strings.HasPrefix(sqliteDSN, "file:") && !strings.Contains(sqliteDSN, "?") {
			sqliteDSN = fmt.Sprintf("file:%s?_foreign_keys=1&_busy_timeout=10000&_journal_mode=WAL", dsn)
		}
		dialector = sqlite.Open(sqliteDSN)
		dialectName = "sqlite3"
	}

	gdb, err := gorm.Open(dialector, &gorm.Config{
		Logger:                                   gormLogger,
		PrepareStmt:                              true,
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return nil, fmt.Errorf("open gorm (%s): %w", dialectName, err)
	}

	sqlDB, err := gdb.DB()
	if err != nil {
		return nil, fmt.Errorf("get underlying sql.DB: %w", err)
	}

	if dialectName == "sqlite3" {
		sqlDB.SetMaxOpenConns(1)
	} else {
		sqlDB.SetMaxIdleConns(10)
		sqlDB.SetMaxOpenConns(100)
		sqlDB.SetConnMaxLifetime(time.Hour)
	}

	return &DatabaseConfig{
		GormDB:      gdb,
		SqlDB:       sqlDB,
		DialectName: dialectName,
	}, nil
}

func openDB(dbPath string) (*sql.DB, error) {
	cfg, err := initGORM(dbPath, false)
	if err != nil {
		return nil, err
	}
	return cfg.SqlDB, nil
}
