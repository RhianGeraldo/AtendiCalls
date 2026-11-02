package main

import (
	"context"
	"database/sql"
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

func openDB(dbPath string) (*sql.DB, error) {
	dsn := "file:" + dbPath + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return db, nil
}

func newServer(ctx context.Context, dbPath, staticDir string, maxCalls int, log *slog.Logger) (*server, error) {
	db, err := openDB(dbPath)
	if err != nil {
		return nil, err
	}
	container := sqlstore.NewWithDB(db, "sqlite3", waLog.Noop)
	if err := container.Upgrade(ctx); err != nil {
		return nil, err
	}
	store, err := newSessionStore(ctx, db)
	if err != nil {
		return nil, err
	}

	callStore, err := newCallStore(ctx, db)
	if err != nil {
		return nil, err
	}

	contactStore, err := newContactStore(ctx, db)
	if err != nil {
		return nil, err
	}

	campaignStore, err := newCampaignStore(ctx, db)
	if err != nil {
		return nil, err
	}

	playbookStore, err := newPlaybookStore(ctx, db)
	if err != nil {
		return nil, err
	}

	settingsStore, err := newSettingsStore(ctx, db)
	if err != nil {
		return nil, err
	}

	agentStore, err := newAIAgentStore(ctx, db)
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

	planStore, err := newPlanStore(ctx, db)
	if err != nil {
		return nil, err
	}

	userStore, err := newUserStore(ctx, db)
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
