package main

import (
	"context"
	"fmt"
	"log/slog"

	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
	_ "modernc.org/sqlite"
)

type server struct {
	broker      *Broker
	sessions    *SessionManager
	users       *userStore
	plans       *planStore
	calls       *callStore
	contacts    *contactStore
	campaigns   *campaignStore
	playbooks   *playbookStore
	settings    *settingsStore
	agents      *aiAgentStore
	transcriber *Transcriber
	webhook     *WebhookDispatcher
	log         *slog.Logger
	staticDir   string
}

func newServer(ctx context.Context, dbPath, staticDir string, maxCalls int, log *slog.Logger) (*server, error) {
	dbCfg, err := initGORM(dbPath, log.Enabled(ctx, slog.LevelDebug))
	if err != nil {
		return nil, err
	}

	var container *sqlstore.Container
	switch dbCfg.DialectName {
	case "postgres":
		container = sqlstore.NewWithDB(dbCfg.SqlDB, "postgres", waLog.Noop)
	case "sqlite3":
		container = sqlstore.NewWithDB(dbCfg.SqlDB, "sqlite3", waLog.Noop)
	default:
		// MySQL fallback for whatsmeow container: WhatsApp keys stay in local SQLite
		var cErr error
		container, cErr = sqlstore.New(ctx, "sqlite3", "file:whatsapp_devices.db?_foreign_keys=1&_busy_timeout=10000&_journal_mode=WAL", waLog.Noop)
		if cErr != nil {
			return nil, fmt.Errorf("init whatsmeow container: %w", cErr)
		}
	}
	if err := container.Upgrade(ctx); err != nil {
		return nil, fmt.Errorf("upgrade whatsmeow container: %w", err)
	}

	store, err := newSessionStore(ctx, dbCfg.GormDB)
	if err != nil {
		return nil, err
	}

	callStore, err := newCallStore(ctx, dbCfg.GormDB, dbCfg.DialectName)
	if err != nil {
		return nil, err
	}

	contactStore, err := newContactStore(ctx, dbCfg.GormDB)
	if err != nil {
		return nil, err
	}

	campaignStore, err := newCampaignStore(ctx, dbCfg.GormDB)
	if err != nil {
		return nil, err
	}

	playbookStore, err := newPlaybookStore(ctx, dbCfg.GormDB)
	if err != nil {
		return nil, err
	}

	settingsStore, err := newSettingsStore(ctx, dbCfg.GormDB)
	if err != nil {
		return nil, err
	}

	agentStore, err := newAIAgentStore(ctx, dbCfg.GormDB)
	if err != nil {
		return nil, err
	}

	waLogger := waLog.Noop
	if log.Enabled(ctx, slog.LevelDebug) {
		waLogger = waLog.Stdout("WA", "INFO", true)
	}

	broker := NewBroker()
	broker.callStore = callStore
	webhook := NewWebhookDispatcher(log)
	webhook.settings = settingsStore
	mgr := newSessionManager(ctx, container, broker, store, waLogger, log, maxCalls, settingsStore, webhook, agentStore)
	broker.SnapshotFn = mgr.snapshotEvents
	broker.SessionOwnerFn = func(sessionID string) string {
		if sess, ok := mgr.Get(sessionID); ok {
			return sess.userID
		}
		return ""
	}

	planStore, err := newPlanStore(ctx, dbCfg.GormDB)
	if err != nil {
		return nil, err
	}

	userStore, err := newUserStore(ctx, dbCfg.GormDB)
	if err != nil {
		return nil, err
	}

	transcriber := NewTranscriber(settingsStore, log)

	return &server{
		broker:      broker,
		sessions:    mgr,
		users:       userStore,
		plans:       planStore,
		calls:       callStore,
		contacts:    contactStore,
		campaigns:   campaignStore,
		playbooks:   playbookStore,
		settings:    settingsStore,
		agents:      agentStore,
		transcriber: transcriber,
		webhook:     webhook,
		log:         log,
		staticDir:   staticDir,
	}, nil
}
