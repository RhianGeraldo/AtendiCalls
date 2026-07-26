package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"
)

type Playbook struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Category  string `json:"category"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

type playbookStore struct {
	db *sql.DB
	mu sync.RWMutex
}

func newPlaybookStore(ctx context.Context, db *sql.DB) (*playbookStore, error) {
	query := `
	CREATE TABLE IF NOT EXISTS playbooks (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		category TEXT DEFAULT '',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_playbooks_title ON playbooks(title);
	`
	_, err := db.ExecContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to create playbooks table: %w", err)
	}

	ps := &playbookStore{db: db}
	ps.seedDefaults(ctx)

	return ps, nil
}

func (ps *playbookStore) seedDefaults(ctx context.Context) {
	var count int
	_ = ps.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM playbooks").Scan(&count)
	if count > 0 {
		return
	}

	defaultContent := `{
  "mode": "stages",
  "stages": [
    {
      "id": "stage_1",
      "title": "1. Abertura (15 a 20s)",
      "script": "Olá, [Nome]. Tudo bem?\nAqui é a [Seu Nome], consultora da Estética e Laser.\nEstou entrando em contato porque a sua amiga [Nome da amiga] participou de uma ação nossa e indicou você para receber uma cortesia exclusiva.\nVocê tem 2 minutinhos para eu te explicar como funciona?",
      "objections": [
        { "trigger": "Não posso falar agora", "response": "Sem problemas. Qual horário fica melhor para eu retornar? É bem rapidinho." }
      ]
    },
    {
      "id": "stage_2",
      "title": "2. Descoberta (30s)",
      "script": "Antes de eu te explicar a cortesia, me conta uma coisa...\nVocê já conhece a depilação a laser ou seria a sua primeira experiência?",
      "objections": [
        { "trigger": "Já fiz", "response": "Que legal! Em qual região você fez? E como foi sua experiência?\n(Escute. Isso cria conexão e gera informações para usar depois.)" },
        { "trigger": "Nunca fiz", "response": "Perfeito! Então vou te explicar de forma bem rápida." }
      ]
    },
    {
      "id": "stage_3",
      "title": "3. Gerar valor (40s)",
      "script": "A depilação a laser é um tratamento que reduz os pelos de forma progressiva e proporciona muito mais conforto no dia a dia.\n\nOs principais benefícios são:\n• Redução dos pelos;\n• Diminuição da foliculite e dos pelos encravados;\n• Pele mais lisa;\n• Menos necessidade de usar lâmina ou cera;\n• Mais praticidade e economia de tempo.\n\nÉ um dos tratamentos mais procurados pela qualidade de vida que proporciona.",
      "objections": [
        { "trigger": "Tenho medo de doer", "response": "É uma dúvida muito comum. Nossa tecnologia possui sistema de resfriamento, que deixa a aplicação muito mais confortável. A maioria das pessoas descreve apenas pequenos estalinhos na pele, e o procedimento é bem rápido." }
      ]
    },
    {
      "id": "stage_4",
      "title": "4. Apresentação da cortesia (30s)",
      "script": "E como você foi indicada pela [Nome da amiga], você ganhou uma cortesia com 3 sessões gratuitas.\n\nVocê pode escolher fazer em uma destas regiões:\n• Axilas;\n• Buço;\n• Faixa de barba.\n\nÉ uma oportunidade para conhecer a tecnologia e experimentar o tratamento sem custo.",
      "objections": [
        { "trigger": "É gratuito mesmo?", "response": "Sim! As três sessões são totalmente gratuitas por conta da indicação da sua amiga. Você não paga por elas. No dia da visita, nossa especialista faz uma avaliação da região e esclarece todas as dúvidas." }
      ]
    },
    {
      "id": "stage_5",
      "title": "5. Criando urgência (20s)",
      "script": "Como essas cortesias são limitadas, nós estamos entrando em contato para reservar os horários disponíveis.\nPor isso, o ideal é já deixar o seu atendimento agendado.",
      "objections": []
    },
    {
      "id": "stage_6",
      "title": "6. Fechamento (40s)",
      "script": "Vamos fazer assim...\nQual período fica melhor para você: manhã, tarde ou noite?\n\nTemos disponibilidade [dia/horário] ou [dia/horário]. Qual você prefere?",
      "objections": [
        { "trigger": "Vou pensar", "response": "Claro, sem problema. Só que essa cortesia tem vagas limitadas. Se eu reservar um horário para você agora, garante o benefício. Se surgir algum imprevisto, conseguimos remarcar." },
        { "trigger": "Não tenho tempo", "response": "Entendo. O atendimento é bem rápido e nós temos horários em diferentes períodos para facilitar sua rotina. Qual costuma ser o melhor horário para você?" },
        { "trigger": "Não tenho interesse", "response": "Sem problemas. Posso só te fazer uma última pergunta? O que faz você não ter interesse hoje? É falta de tempo, já faz tratamento em outro lugar ou outro motivo?" },
        { "trigger": "Vou falar com minha amiga primeiro", "response": "Claro! Inclusive ela participou da ação e fez sua indicação justamente para que você pudesse aproveitar. Posso deixar um horário reservado e depois você confirma sem problema." }
      ]
    }
  ]
}`

	now := time.Now().UnixMilli()
	pb := Playbook{
		ID:        "pb_default_laser",
		Title:     "Playbook Completo - Indicação & Cortesia (Estética e Laser)",
		Content:   defaultContent,
		Category:  "Vendas / Indicação",
		CreatedAt: now,
		UpdatedAt: now,
	}

	_, _ = ps.Create(ctx, pb)
}

func (ps *playbookStore) Create(ctx context.Context, p Playbook) (*Playbook, error) {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	now := time.Now().UnixMilli()
	if p.ID == "" {
		p.ID = fmt.Sprintf("pb_%d", now)
	}
	if p.CreatedAt == 0 {
		p.CreatedAt = now
	}
	p.UpdatedAt = now

	p.Title = strings.TrimSpace(p.Title)

	query := `INSERT INTO playbooks (id, title, content, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
	_, err := ps.db.ExecContext(ctx, query, p.ID, p.Title, p.Content, p.Category, p.CreatedAt, p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to save playbook: %w", err)
	}

	return &p, nil
}

func (ps *playbookStore) Update(ctx context.Context, p Playbook) (*Playbook, error) {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	now := time.Now().UnixMilli()
	p.UpdatedAt = now

	query := `UPDATE playbooks SET title = ?, content = ?, category = ?, updated_at = ? WHERE id = ?`
	res, err := ps.db.ExecContext(ctx, query, p.Title, p.Content, p.Category, p.UpdatedAt, p.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to update playbook: %w", err)
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return nil, fmt.Errorf("playbook not found")
	}

	return &p, nil
}

func (ps *playbookStore) Delete(ctx context.Context, id string) error {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	_, err := ps.db.ExecContext(ctx, "DELETE FROM playbooks WHERE id = ?", id)
	return err
}

func (ps *playbookStore) List(ctx context.Context) ([]Playbook, error) {
	ps.mu.RLock()
	defer ps.mu.RUnlock()

	query := `SELECT id, title, content, category, created_at, updated_at FROM playbooks ORDER BY title ASC`
	rows, err := ps.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]Playbook, 0)
	for rows.Next() {
		var p Playbook
		if err := rows.Scan(&p.ID, &p.Title, &p.Content, &p.Category, &p.CreatedAt, &p.UpdatedAt); err == nil {
			list = append(list, p)
		}
	}

	return list, nil
}
