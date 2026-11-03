package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

type Playbook struct {
	ID        string `gorm:"primaryKey" json:"id"`
	UserID    string `gorm:"index" json:"userId,omitempty"`
	Title     string `gorm:"index;not null" json:"title"`
	Content   string `gorm:"type:text;not null" json:"content"`
	Category  string `gorm:"default:''" json:"category"`
	CreatedAt int64  `gorm:"not null" json:"createdAt"`
	UpdatedAt int64  `gorm:"not null" json:"updatedAt"`
}

func (Playbook) TableName() string {
	return "playbooks"
}

type playbookStore struct {
	db *gorm.DB
	mu sync.RWMutex
}

func newPlaybookStore(ctx context.Context, db *gorm.DB) (*playbookStore, error) {
	if err := db.WithContext(ctx).AutoMigrate(&Playbook{}); err != nil {
		return nil, fmt.Errorf("auto migrate playbooks: %w", err)
	}

	ps := &playbookStore{db: db}
	ps.seedDefaults(ctx)

	return ps, nil
}

func (ps *playbookStore) seedDefaults(ctx context.Context) {
	var count int64
	_ = ps.db.WithContext(ctx).Model(&Playbook{}).Count(&count).Error
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

	if err := ps.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, fmt.Errorf("failed to save playbook: %w", err)
	}
	return &p, nil
}

func (ps *playbookStore) GetByID(ctx context.Context, id string) (*Playbook, error) {
	ps.mu.RLock()
	defer ps.mu.RUnlock()

	var p Playbook
	if err := ps.db.WithContext(ctx).Where("id = ?", id).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (ps *playbookStore) Update(ctx context.Context, p Playbook) (*Playbook, error) {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	now := time.Now().UnixMilli()
	p.UpdatedAt = now

	updates := map[string]any{
		"title":      p.Title,
		"content":    p.Content,
		"category":   p.Category,
		"updated_at": p.UpdatedAt,
	}

	res := ps.db.WithContext(ctx).Model(&Playbook{}).Where("id = ?", p.ID).Updates(updates)
	if res.Error != nil {
		return nil, fmt.Errorf("failed to update playbook: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, fmt.Errorf("playbook not found")
	}

	return &p, nil
}

func (ps *playbookStore) Delete(ctx context.Context, id string) error {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	return ps.db.WithContext(ctx).Where("id = ?", id).Delete(&Playbook{}).Error
}

func (ps *playbookStore) List(ctx context.Context, userID string) ([]Playbook, error) {
	ps.mu.RLock()
	defer ps.mu.RUnlock()

	var list []Playbook
	query := ps.db.WithContext(ctx).Order("title asc")
	if userID != "" {
		query = query.Where("user_id = ? OR user_id = ''", userID)
	}
	if err := query.Find(&list).Error; err != nil {
		return nil, err
	}
	return list, nil
}
