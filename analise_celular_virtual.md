# Análise Abrangente do Sistema de Ligação - Celular Virtual (Softphone)

Este documento apresenta uma análise detalhada da interface, comportamentos, estados, modo flutuante e experiência do usuário (UI/UX) do **Celular Virtual (Softphone)** do sistema **Atendi**.

---

## 1. Arquitetura de Exibição e Modo Flutuante (Floating Mode)

### 1.1 Persistência Global no App
- **Montagem via React Portal**: O componente do celular virtual (`WavoipCallOverlay`) é montado na raiz autenticada da aplicação (`_authenticated/route.tsx`) e renderizado diretamente no `document.body` via `createPortal`.
- **Navegação Sem Interrupção**: Por estar fora do fluxo tradicional de páginas, a ligação permanece ativa e a janela do celular continua visível mesmo quando o usuário navega entre abas (Conversas, CRM, Histórico de Chamadas, Configurações, etc.).
- **Camada Visual (`z-index`)**: O widget flutuante possui classe `z-[100]`, garantindo que fique sobreposto a modais, painéis laterais e menus dropdown da aplicação.

### 1.2 Posicionamento e Dimensões
- **Posição Inicial**: Padrão no canto inferior direito (`fixed bottom-6 right-6`).
- **Dimensões Físicas**:
  - **Largura**: `320px` em telas menores, expandindo para `340px` a partir do breakpoint `sm`.
  - **Altura**: `550px` fixa, simulando a proporção de um smartphone físico.
  - **Bordas e Formato**: Cantos altamente arredondados (`rounded-3xl`), imitando o chassi de um smartphone moderno.
  - **Estilização Visual**: Fundo branco limpo (`bg-white`), bordas suaves em Slate (`border-slate-200`) e sombra projetada profunda (`shadow-2xl`).

### 1.3 Comportamento do Arraste (`useDraggable`)
- **Área de Arraste (Drag Handle)**: O usuário pode clicar/tocar em qualquer região neutra da janela (ex: o cabeçalho superior com botões de fechar/configurações) para mover o celular virtual livremente pela tela.
- **Proteção de Elementos Interativos**: O mecanismo de arraste detecta e ignora automaticamente cliques em botões, campos de texto, seletores (`Select`) ou elementos marcados com a classe `.no-drag`, prevenindo que acionamentos acidentais iniciem o movimento da janela.
- **Feedback de Cursor**: Durante o arraste, o cursor do mouse muda para `cursor-grabbing` e ativa a propriedade `select-none` para evitar a seleção indesejada de textos na tela.
- **Tecnologia de Movimento**: Utiliza coordenadas calculadas via ponteiro (mouse ou touch) aplicadas em tempo real através da propriedade CSS `transform: translate(x, y)`.

---

## 2. Componentes e Interfaces do Celular Virtual

O sistema de ligação do celular virtual divide-se em **4 interfaces principais**:

```
+-----------------------------------------------------------------------+
|                        SISTEMA DE CELULAR VIRTUAL                      |
+--------------------------+--------------------------------------------+
|  Teclado Numérico        |  Modos da Janela de Chamada                 |
|  (WavoipDialer)          |  (WavoipCallOverlay)                       |
|  - Digitação/Atalhos     |  - Chamada Recebida (Incoming)              |
|  - Seletor de Instância  |  - Chamando/Iniciando (Dialing/Ringing)    |
|  - Formatação (XX) XXXX  |  - Chamada Ativa com Cronômetro e Controles|
+--------------------------+--------------------------------------------+
```

---

### 2.1 Teclado Numérico / Discador (`WavoipDialer`)

O discador permite iniciar ligações manuais para qualquer número.

#### A. Gatilhos de Abertura
- Botão com ícone de telefone (`<Phone />`) localizado na barra superior de busca e filtros da lista de conversas.
- Ao ser acionado, abre a janela flutuante do teclado numérico no canto da tela.

#### B. Barra Superior do Discador
- **Seletor de Instância de Origem**: Permite ao atendente escolher por qual número/instância do WhatsApp a ligação será efetuada através de um menu dropdown (`Select`).
- **Botão Fechar (`X`)**: Oculta o discador e reseta o número digitado.

#### C. Display de Digitação
- **Formatação Dinâmica de Telefone**: Conforme o usuário digita os números, o display aplica automaticamente a máscara telefônica brasileira:
  - Digitação inicial: `(XX) XXXX...`
  - Mais de 10 dígitos: `(XX) XXXXX-XXXX`
- **Placeholder**: Exibe a mensagem `"Digite..."` quando o campo está vazio.

#### D. Grid de Digitação (Teclado 3x4)
- **Visual dos Botões**: Botões circulares (`60px x 60px`) com fundo cinza claro (`bg-[#f3f4f6]`), efeito hover (`hover:bg-[#e5e7eb]`) e estado ativo ao pressionar (`active:bg-[#d1d5db]`).
- **Mapeamento de Teclas**:
  - `1`, `2` (ABC), `3` (DEF)
  - `4` (GHI), `5` (JKL), `6` (MNO)
  - `7` (PQRS), `8` (TUV), `9` (WXYZ)
  - `*`, `0` (+), `#`

#### E. Ações Inferiores e Atalhos
- **Botão Ligar**: Botão circular verde destaque (`bg-[#10b981]`) com ícone de telefone centralizado. Permanece desabilitado caso o número possua menos de 8 dígitos ou nenhuma instância esteja selecionada.
- **Botão Backspace (Apagar)**: Botão circular escuro (`bg-slate-800`) exibido à direita da tecla de ligar somente quando há dígitos informados.
- **Suporte a Teclado Físico**: O discador escuta eventos globais do teclado quando aberto:
  - Teclas `0-9`, `*`, `#`: Adicionam os dígitos.
  - `Backspace`: Apaga o último dígito.
  - `Enter`: Inicia a ligação se o número for válido.

---

### 2.2 Chamada Recebida (`Incoming Call`)

Exibida automaticamente quando um cliente efetua uma ligação para uma das linhas ativas da empresa.

#### A. Elementos Visuais e Animações
- **Cabeçalho**: Exibe a tag `Whatsapp Audio` com ícone.
- **Indicador de Chamada**: Ponto verde pulsante (`bg-green-500 animate-pulse`) acompanhado do texto `"Recebendo chamada..."`.
- **Efeito de Radar no Avatar**: O avatar do contato possui um anel externo verde com animação de onda (`border-green-500/30 animate-ping`).
- **Avatar do Contato**: Moldura quadrada suavizada (`w-24 h-24 rounded-2xl`). Exibe a foto do perfil se disponível ou um ícone genérico de usuário (`User`).
- **Identificação**: Nome do contato em destaque grande (`text-2xl font-light`) e o número de telefone em texto secundário.

#### B. Controles de Ação
- **Botão Recusar (Vermelho - `bg-red-600`)**: Rejeita a ligação recebida e fecha o overlay.
- **Botão Aceitar (Verde - `bg-[#10b981]`)**: Atende a ligação e transiciona imediatamente para a tela de **Chamada Ativa**.

---

### 2.3 Chamada em Conexão / Discando (`Connecting / Ringing`)

Exibida quando o operador inicia uma ligação sainte (pelo discador ou pelo botão de ligar direto do chat).

#### A. Elementos Visuais
- **Tag do Serviço**: `Whatsapp Audio`.
- **Indicador de Status**: Ponto cinza pulsante (`bg-slate-300 animate-pulse`) com textos dinâmicos de acordo com o progresso:
  - `"Iniciando chamada..."`
  - `"Conectando..."`
  - `"Chamando..."`
  - `"Finalizada"`
- **Dados do Destinatário**: Avatar, nome resolvido do contato (ou número) e telefone completo.

#### B. Controles de Ação
- **Botão Encerrar/Cancelar**: Botão circular vermelho (`bg-[#ef4444]`) que permite cancelar a tentativa de chamada antes do atendimento do destinatário.

---

### 2.4 Chamada Ativa (`Active Call`)

Exibida assim que a ligação é atendida por ambas as partes.

#### A. Layout do Cabeçalho e Cronômetro
- **Avatar Compacto**: Foto do perfil (`w-16 h-16 rounded-2xl`).
- **Identificação do Contato**: Nome em destaque e número do telefone secundário.
- **Cronômetro de Duração**: Contador em tempo real no formato `MM:SS` (ex: `03:12`), atualizado a cada 1 segundo.

#### B. Painel de Ações e Grade de Controles (Grid 3x2)
O celular virtual apresenta 6 botões dispostos em uma grade circular ergonomicamente organizada:

| Botão | Ícone | Cor/Estilo | Função |
| :--- | :---: | :--- | :--- |
| **Espera** | `Pause` | Fundo cinza (`#f3f4f6`) | Coloca a chamada em espera |
| **Vídeo** | `Video` | Fundo cinza (`#f3f4f6`) | Alterna modo de vídeo |
| **Silenciar** | `Mic` / `MicOff` | Dinâmico: Fundo cinza quando desativado; Fundo escuro (`bg-slate-800 text-white`) quando Muted | Alterna o microfone entre ligado/desligado |
| **Transferir** | `PhoneForwarded` | Fundo cinza (`#f3f4f6`) | Abre opções para transferir a chamada |
| **Finalizar** | `PhoneOff` | Vermelho destaque (`bg-[#ef4444] hover:bg-[#dc2626]`) | Desconecta e encerra a ligação |
| **Teclado** | `Grip` | Fundo cinza (`#f3f4f6`) | Abre o teclado de digitação durante a chamada (DTMF) |

---

## 3. Resumo dos Comportamentos e UX

1. **Gatilhos de Chamada Sainte**:
   - Através do teclado numérico (`WavoipDialer`).
   - Através do botão de ligação direta presente no cabeçalho das conversas ativas no chat.
2. **Resolução de Nome do Contato**:
   - Sempre que uma chamada entra ou sai, o sistema pesquisa o número na base de dados de contatos da empresa e substitui a exibição do número bruto pelo **Nome do Contato**.
3. **Transição Suave de Encerramento (`Close Delay`)**:
   - Quando a ligação termina, o status é alterado para `"Finalizada"` e o card permanece visível por **2 segundos** antes de desaparecer. Isso impede que a janela suma abruptamente na tela do operador.
4. **Respeito à Seleção de Texto e Cliques**:
   - O modo flutuante permite mover o celular virtual para qualquer posição sem interromper o uso do restante da tela (CRM, tickets, chat). Interações em botões e seletores não disparam o movimento de arrastar.

---
*Relatório gerado automaticamente para documentação do módulo de Celular Virtual do Atendi.*
