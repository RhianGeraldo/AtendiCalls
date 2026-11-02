package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
)

type WebhookPayload struct {
	Event     string `json:"event"`
	CallID    string `json:"callId"`
	SessionID string `json:"sessionId"`
	Timestamp int64  `json:"timestamp"`
	Data      any    `json:"data"`
}

type webhookTask struct {
	url     string
	payload WebhookPayload
	retry   int
}

type WebhookDispatcher struct {
	queue    chan webhookTask
	client   *http.Client
	log      *slog.Logger
	wg       sync.WaitGroup
	ctx      context.Context
	cancel   context.CancelFunc
	settings *settingsStore
}

func NewWebhookDispatcher(log *slog.Logger) *WebhookDispatcher {
	if log == nil {
		log = slog.Default()
	}
	ctx, cancel := context.WithCancel(context.Background())
	d := &WebhookDispatcher{
		queue:  make(chan webhookTask, 1000),
		client: &http.Client{Timeout: 10 * time.Second},
		log:    log.With("subsystem", "webhook"),
		ctx:    ctx,
		cancel: cancel,
	}

	// Spin up 4 worker goroutines for concurrent webhook delivery
	for i := 0; i < 4; i++ {
		d.wg.Add(1)
		go d.worker()
	}

	return d
}

func (d *WebhookDispatcher) Dispatch(url, event, callID, sessionID string, data any) {
	if url == "" {
		return
	}
	task := webhookTask{
		url: url,
		payload: WebhookPayload{
			Event:     event,
			CallID:    callID,
			SessionID: sessionID,
			Timestamp: time.Now().UnixMilli(),
			Data:      data,
		},
		retry: 0,
	}

	select {
	case d.queue <- task:
	default:
		d.log.Warn("webhook queue full, dropping event", "event", event, "call_id", callID)
	}
}

func (d *WebhookDispatcher) worker() {
	defer d.wg.Done()

	for {
		select {
		case <-d.ctx.Done():
			return
		case task, ok := <-d.queue:
			if !ok {
				return
			}
			d.sendWithRetry(task)
		}
	}
}

func (d *WebhookDispatcher) sendWithRetry(task webhookTask) {
	body, err := json.Marshal(task.payload)
	if err != nil {
		return
	}

	req, err := http.NewRequestWithContext(d.ctx, "POST", task.url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "AtendiCalls-VoiceEngine/1.0")

	// Sign webhook payload with HMAC SHA-256 if system_api_key is configured
	if d.settings != nil {
		if secret, err := d.settings.Get(d.ctx, "system_api_key"); err == nil && strings.TrimSpace(secret) != "" {
			mac := hmac.New(sha256.New, []byte(strings.TrimSpace(secret)))
			mac.Write(body)
			sig := hex.EncodeToString(mac.Sum(nil))
			req.Header.Set("X-AtendiCalls-Signature-256", "sha256="+sig)
			req.Header.Set("X-Hub-Signature-256", "sha256="+sig)
		}
	}

	resp, err := d.client.Do(req)
	if err != nil || (resp != nil && resp.StatusCode >= 400) {
		status := 0
		if resp != nil {
			status = resp.StatusCode
			_ = resp.Body.Close()
		}
		if task.retry < 2 {
			task.retry++
			time.AfterFunc(time.Duration(task.retry)*time.Second, func() {
				select {
				case d.queue <- task:
				default:
				}
			})
		} else {
			d.log.Warn("webhook delivery failed permanently", "url", task.url, "event", task.payload.Event, "status", status, "err", err)
		}
		return
	}
	_ = resp.Body.Close()
}

func (d *WebhookDispatcher) Close() {
	d.cancel()
	d.wg.Wait()
}
