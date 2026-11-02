package main

import (
	"context"
	"testing"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

func TestExtractMessageText_ButtonResponses(t *testing.T) {
	// 1. Native Flow interactive response with paramsJSON
	msgNative := &waE2E.Message{
		InteractiveResponseMessage: &waE2E.InteractiveResponseMessage{
			InteractiveResponseMessage: &waE2E.InteractiveResponseMessage_NativeFlowResponseMessage_{
				NativeFlowResponseMessage: &waE2E.InteractiveResponseMessage_NativeFlowResponseMessage{
					Name:       proto.String("quick_reply"),
					ParamsJSON: proto.String(`{"id":"confirm_yes","text":"Sim, confirmado!"}`),
				},
			},
		},
	}
	if text := extractMessageText(msgNative); text != "Sim, confirmado!" {
		t.Fatalf("expected 'Sim, confirmado!', got %q", text)
	}
	if typ := getMessageType(msgNative); typ != "button_response" {
		t.Fatalf("expected 'button_response', got %q", typ)
	}

	// 2. Buttons response message
	msgButtons := &waE2E.Message{
		ButtonsResponseMessage: &waE2E.ButtonsResponseMessage{
			SelectedButtonID: proto.String("btn_opcao_1"),
			Response: &waE2E.ButtonsResponseMessage_SelectedDisplayText{
				SelectedDisplayText: "Opção 1",
			},
		},
	}
	if text := extractMessageText(msgButtons); text != "Opção 1" {
		t.Fatalf("expected 'Opção 1', got %q", text)
	}
	if typ := getMessageType(msgButtons); typ != "button_response" {
		t.Fatalf("expected 'button_response', got %q", typ)
	}

	// 3. Template button reply message
	msgTemplate := &waE2E.Message{
		TemplateButtonReplyMessage: &waE2E.TemplateButtonReplyMessage{
			SelectedID:          proto.String("tpl_btn_2"),
			SelectedDisplayText: proto.String("Falar com Atendente"),
		},
	}
	if text := extractMessageText(msgTemplate); text != "Falar com Atendente" {
		t.Fatalf("expected 'Falar com Atendente', got %q", text)
	}
	if typ := getMessageType(msgTemplate); typ != "button_response" {
		t.Fatalf("expected 'button_response', got %q", typ)
	}
}

func TestSendButtonsMessage_Validation(t *testing.T) {
	s := &Session{} // client is nil
	ctx := context.Background()
	peer := types.NewJID("5511999998888", types.DefaultUserServer)

	// Disconnected client
	_, err := s.sendButtonsMessage(ctx, peer, "Título", "Corpo", "Rodapé", []WhatsAppButton{
		{Type: "reply", Text: "Opção 1"},
	})
	if err == nil {
		t.Fatal("expected error when session is not connected, got nil")
	}

	// Empty buttons
	s.client = nil
	_, err = s.sendButtonsMessage(ctx, peer, "Título", "Corpo", "Rodapé", nil)
	if err == nil {
		t.Fatal("expected error with empty buttons, got nil")
	}

	// Empty button text
	_, err = s.sendButtonsMessage(ctx, peer, "Título", "Corpo", "Rodapé", []WhatsAppButton{
		{Type: "reply", Text: "   "},
	})
	if err == nil {
		t.Fatal("expected error with empty button text, got nil")
	}

	// More than 10 buttons
	manyButtons := make([]WhatsAppButton, 11)
	for i := range manyButtons {
		manyButtons[i] = WhatsAppButton{Type: "reply", Text: "btn"}
	}
	_, err = s.sendButtonsMessage(ctx, peer, "Título", "Corpo", "Rodapé", manyButtons)
	if err == nil {
		t.Fatal("expected error with > 10 buttons, got nil")
	}
}

func TestExtractButtonID(t *testing.T) {
	// Native Flow
	msgNative := &waE2E.Message{
		InteractiveResponseMessage: &waE2E.InteractiveResponseMessage{
			InteractiveResponseMessage: &waE2E.InteractiveResponseMessage_NativeFlowResponseMessage_{
				NativeFlowResponseMessage: &waE2E.InteractiveResponseMessage_NativeFlowResponseMessage{
					ParamsJSON: proto.String(`{"id":"btn_sim_123"}`),
				},
			},
		},
	}
	if id := extractButtonID(msgNative); id != "btn_sim_123" {
		t.Fatalf("expected 'btn_sim_123', got %q", id)
	}

	// ButtonsResponseMessage
	msgBtn := &waE2E.Message{
		ButtonsResponseMessage: &waE2E.ButtonsResponseMessage{
			SelectedButtonID: proto.String("btn_opcao_abc"),
		},
	}
	if id := extractButtonID(msgBtn); id != "btn_opcao_abc" {
		t.Fatalf("expected 'btn_opcao_abc', got %q", id)
	}

	// TemplateButtonReplyMessage
	msgTpl := &waE2E.Message{
		TemplateButtonReplyMessage: &waE2E.TemplateButtonReplyMessage{
			SelectedID: proto.String("tpl_xyz"),
		},
	}
	if id := extractButtonID(msgTpl); id != "tpl_xyz" {
		t.Fatalf("expected 'tpl_xyz', got %q", id)
	}
}
