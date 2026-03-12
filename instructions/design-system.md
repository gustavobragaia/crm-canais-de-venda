# Design System — Closio CRM

Referência de padrões visuais extraídos do settings page redesenhado. Use este guia ao criar ou atualizar qualquer componente.

---

## 1. Paleta de Cores

### CSS Variable (cor primária dinâmica)
```
bg-[var(--primary)]      → botões CTA, nav ativo
text-[var(--primary)]    → links, ícones ativos
border-[var(--primary)]  → card destacado (ex: plano recomendado)
hover:opacity-90         → hover padrão para var(--primary)
```

### Violet — ações do agente de IA
```
bg-violet-50   text-violet-700   → bg suave (badges, botão ghost)
bg-violet-100                    → bg ícone accordion
bg-violet-600  text-white        → botão primário violeta
text-violet-600                  → ícone colorido
focus:ring-violet-300            → ring de foco em inputs
border-violet-200                → borda de botão ghost violeta
```

### Emerald/Green — sucesso, ativo
```
bg-emerald-50  text-emerald-700  → badge "Ativo"
bg-emerald-600                   → dot de status ativo
text-emerald-600/700             → texto sucesso
border-emerald-200               → borda card sucesso
bg-green-100   text-green-700    → badge conectado (canal)
```

### Gray — neutros, bordas, texto secundário
```
border-gray-100    → borda card padrão (mais suave)
border-gray-200    → borda card alternativa
bg-gray-50         → thead de tabela, hover de linha
bg-gray-100        → nav ativo, badge neutro
text-gray-900      → texto principal
text-gray-700      → label, texto secundário
text-gray-500      → subtítulo, placeholder
text-gray-400      → texto terciário, ícone inativo
```

### Cores semânticas (uso pontual)
```
Blue:   bg-blue-50 text-blue-600   → info, botão webhook
Amber:  bg-amber-50 text-amber-600 → seção horários
Red:    bg-red-50  text-red-600    → danger, desconectado
Purple: bg-purple-100 text-purple-700 → badge Admin
```

### Cores de canal (fixas)
```
WhatsApp: bg-[#25D366]
Instagram: #E4405F
Facebook:  #1877F2
```

---

## 2. Cards

### Card padrão
```html
<div class="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
```

### Card com destaque de sucesso
```html
<div class="bg-white border border-emerald-200 rounded-2xl shadow-sm p-5">
```

### Card com destaque de marca (ex: plano recomendado)
```html
<div class="bg-white border border-[var(--primary)] rounded-2xl shadow-sm p-5">
```

### Card de grupo (com seções internas divididas)
```html
<div class="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
```

> Regra: sempre `rounded-2xl`, `shadow-sm`, `border-gray-100`. Nunca usar `rounded-xl` + `border-gray-200` nos cards principais.

---

## 3. Headers de Página e Seção

### Header de página (topo de aba/rota)
```html
<div class="mb-8">
  <h2 class="text-xl font-semibold text-gray-900">Título da Página</h2>
  <p class="text-sm text-gray-500 mt-1">Descrição concisa do que o usuário pode fazer aqui.</p>
</div>
```

### Header de página com ação à direita
```html
<div class="mb-8 flex items-start justify-between gap-4">
  <div>
    <h2 class="text-xl font-semibold text-gray-900">Título</h2>
    <p class="text-sm text-gray-500 mt-1">Subtítulo</p>
  </div>
  <button class="... flex-shrink-0">Ação</button>
</div>
```

### Header de subseção (dentro de card)
```html
<h3 class="font-semibold text-gray-900 mb-1">Subtítulo</h3>
<p class="text-xs text-gray-500 mb-5">Descrição curta.</p>
```

### Header de grupo (label de categoria)
```html
<h3 class="text-sm font-medium text-gray-700 mb-3">WhatsApp</h3>
```

---

## 4. Botões

### Primário (CTA principal da página)
```html
<button class="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] hover:opacity-90 text-white text-sm font-medium rounded-xl transition-colors">
  Ação
</button>
```

### Primário violeta (ações do agente de IA)
```html
<button class="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
  Salvar configurações
</button>
```

### Ghost violeta (ação secundária, ex: salvar papel)
```html
<button class="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 disabled:opacity-60 transition-colors">
  Salvar papel
</button>
```

### Secundário (outlined, neutro)
```html
<button class="border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium rounded-xl px-4 py-2.5 transition-colors">
  Ação secundária
</button>
```

### Ghost (texto, navegação)
```html
<button class="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
  Ação
</button>
```

### Danger (destructive)
```html
<button class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors font-medium">
  Remover
</button>
```

### Info (ação de sistema)
```html
<button class="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors font-medium">
  Corrigir
</button>
```

### Canal WhatsApp
```html
<button class="flex items-center gap-2 text-sm px-4 py-2 bg-[#25D366] hover:opacity-90 text-white rounded-lg transition-colors font-medium">
  Conectar WhatsApp
</button>
```

### Estado de loading (dentro de qualquer botão)
```html
<Loader2 size={15} class="animate-spin" /> Salvando...
```

### Estado de sucesso (dentro de qualquer botão)
```html
<CheckCircle2 size={15} /> Salvo!
```

---

## 5. Formulários

### Label
```html
<label class="block text-xs font-medium text-gray-600 mb-1.5">Nome do campo</label>
```

### Input de texto
```html
<input class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white" />
```

### Textarea
```html
<textarea rows={3} class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"></textarea>
```

### Select
```html
<select class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"></select>
```

### Grid de campos (2 colunas)
```html
<div class="grid grid-cols-2 gap-4"> ... </div>
```

### Grid de campos (3 colunas)
```html
<div class="grid grid-cols-3 gap-3"> ... </div>
```

### Botões de seleção inline (ex: gênero)
```html
<!-- Selecionado -->
<button class="flex-1 py-2 text-xs rounded-lg border border-violet-600 bg-violet-50 text-violet-700 font-medium transition-colors">
  Opção
</button>
<!-- Não selecionado -->
<button class="flex-1 py-2 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
  Opção
</button>
```

---

## 6. Toggle Switch

```html
<button
  onClick={toggle}
  class="w-11 h-6 rounded-full transition-colors relative {active ? 'bg-violet-600' : 'bg-gray-300'}"
>
  <span class="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all {active ? 'left-6' : 'left-1'}" />
</button>
```

### Toggle com label
```html
<div class="flex items-center justify-between">
  <div>
    <p class="font-medium text-gray-900 text-sm">Nome do toggle</p>
    <p class="text-xs text-gray-500 mt-0.5">Descrição curta do efeito.</p>
  </div>
  <!-- toggle button acima -->
</div>
```

---

## 7. Badges e Indicadores de Status

### Badge de status (inline)
```html
<!-- Ativo -->
<span class="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
  Ativo
</span>

<!-- Inativo -->
<span class="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
  <span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
  Inativo
</span>
```

### Badge de cargo
```html
<!-- Admin -->
<span class="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">Admin</span>
<!-- Agente -->
<span class="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">Agente</span>
```

### Badge "Em breve"
```html
<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Em breve</span>
```

### Badge conectado/desconectado (canal)
```html
<!-- Conectado -->
<span class="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 bg-green-100 text-green-700">
  <CheckCircle2 size={11} /> Conectado
</span>
<!-- Desconectado -->
<span class="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Desconectado</span>
```

---

## 8. Accordion

### Container (group)
```html
<div class="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
```

### Header clicável
```html
<button class="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left">
  <!-- ícone colorido -->
  <div class="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
    <Icon size={15} class="text-violet-600" />
  </div>
  <!-- textos -->
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium text-gray-900">Título da seção</p>
    <p class="text-xs text-gray-400 mt-0.5">Descrição do conteúdo</p>
  </div>
  <!-- chevron -->
  <ChevronDown size={16} class="text-gray-400 transition-transform flex-shrink-0 {isOpen ? 'rotate-180' : ''}" />
</button>
```

### Cores de ícone por seção (convenção)
```
Identidade   → bg-violet-50  / text-violet-600
Objetivo     → bg-blue-50    / text-blue-600
Horários     → bg-amber-50   / text-amber-600
Encaminham.  → bg-emerald-50 / text-emerald-600
```

### Conteúdo expandido
```html
<div class="px-5 pb-5 pt-1 space-y-4">
  <!-- campos -->
</div>
```

### Estado (um aberto por vez)
```ts
const [openAccordion, setOpenAccordion] = useState<string | null>('identity')
const isOpen = openAccordion === 'sectionKey'
onClick={() => setOpenAccordion(isOpen ? null : 'sectionKey')}
```

---

## 9. Tabela

```html
<div class="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
  <table class="w-full">
    <thead>
      <tr class="bg-gray-50 border-b border-gray-100">
        <th class="text-left px-5 py-3 text-xs font-medium text-gray-500">Coluna</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-100">
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="px-5 py-4 text-sm font-medium text-gray-900">Dado principal</td>
        <td class="px-5 py-4 text-sm text-gray-500">Dado secundário</td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 10. Avatares

### Avatar de imagem (agente de IA)
```html
<img src="/ai-avatar.svg" alt="Avatar" class="w-14 h-14 rounded-full object-cover flex-shrink-0" />
<!-- Simulador: w-16 h-16 -->
```

### Avatar com iniciais (usuário)
```html
<div
  class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
  style={{ backgroundColor: getAvatarColor(name) }}
>
  {getInitials(name)}
</div>
<!-- Tamanhos: w-7 h-7 (lista), w-8 h-8 (sidebar), w-9 h-9 (card) -->
```

### Paleta de cores de avatar (array circular)
```ts
const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#6366F1', '#84CC16', '#F97316',
]
function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}
```

### Avatar de canal (ícone colorido)
```html
<div class="w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
     style={{ backgroundColor: channelColor }}>
  <ChannelIcon size={20} />
</div>
```

---

## 11. Modal / Overlay

```html
<!-- Backdrop -->
<div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
  <!-- Modal -->
  <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-gray-900">Título</h3>
      <button class="text-gray-400 hover:text-gray-600"><X size={18} /></button>
    </div>
    <!-- Conteúdo -->
  </div>
</div>
```

---

## 12. Tipografia

| Uso | Classes |
|-----|---------|
| Título de página | `text-xl font-semibold text-gray-900` |
| Subtítulo de página | `text-sm text-gray-500` |
| Título de card | `font-semibold text-gray-900` |
| Subtítulo de card | `text-xs text-gray-500` |
| Label de campo | `text-xs font-medium text-gray-600` |
| Texto principal | `text-sm text-gray-900` |
| Texto secundário | `text-sm text-gray-500` |
| Texto terciário | `text-xs text-gray-400` |
| Badge | `text-xs font-medium` |
| Código/senha | `text-sm font-mono text-gray-800` |

---

## 13. Espaçamento

### Vertical (empilhamento)
```
mb-8    → separação entre seções de página
mb-5    → separação entre grupos de campos
mb-4    → separação entre cards
mb-2    → separação entre itens de lista
space-y-4 / space-y-5 → listas de itens
```

### Horizontal
```
gap-2  → elementos pequenos (ícone + texto)
gap-3  → elementos médios
gap-4  → campos de formulário
gap-6  → colunas de layout
```

### Padding interno de card
```
p-4  → card compacto
p-5  → card padrão
p-6  → card espaçoso (modal)
px-5 py-4 → linha de tabela
px-5 py-3 → header de tabela
```

---

## 14. Layouts

### 2 colunas — conteúdo + painel lateral fixo
```html
<div class="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
  <div class="space-y-4"><!-- conteúdo principal --></div>
  <div class="bg-white ... sticky top-6 h-fit"><!-- painel --></div>
</div>
```

### 3 colunas — cards de plano
```html
<div class="grid grid-cols-3 gap-4">
```

### Sidebar + conteúdo principal (layout de página)
```html
<aside class="w-[280px] min-h-screen bg-white border-r border-gray-200 flex flex-col">
<main class="flex-1 overflow-y-auto">
```

---

## 15. Estados de Interação

### Hover
```
hover:bg-gray-50      → linha de tabela, item de lista
hover:bg-gray-100     → nav item, botão ghost
hover:bg-violet-100   → botão ghost violeta
hover:opacity-90      → botão com bg colorido (--primary, canais)
```

### Focus (inputs)
```
focus:outline-none focus:ring-2 focus:ring-violet-300
```

### Disabled
```
disabled:opacity-50
disabled:opacity-60
```

### Loading
```tsx
<Loader2 size={14} className="animate-spin text-gray-400" />
// ou dentro de botão:
<Loader2 size={15} className="animate-spin" /> Salvando...
```

### Sucesso temporário
```tsx
// Mostrar por 2–3 segundos, depois reverter
setSuccessState(true)
setTimeout(() => setSuccessState(false), 2000)

// UI:
<CheckCircle2 size={15} /> Salvo!
```

### Transições
```
transition-colors   → mudança de cor
transition-transform → rotação (chevron do accordion)
transition-all      → toggle switch
```

---

## 16. Princípios de Design

1. **Cards sempre com `rounded-2xl`** — nunca `rounded-lg` ou `rounded-xl` em cards principais
2. **Bordas sutis** — `border-gray-100` (padrão), `border-gray-200` (variante)
3. **Sombra uniforme** — `shadow-sm` em todos os cards, nunca `shadow-md` (exceto modal)
4. **Hierarquia de cor cinza** — `gray-900` principal → `gray-500` secundário → `gray-400` terciário
5. **Violeta para IA** — todas as ações relacionadas ao agente de IA usam violeta
6. **`var(--primary)` para ações gerais** — CTA, nav ativo, botão de convidar
7. **Emerald para sucesso** — estados ativos, confirmações, badges positivos
8. **Sem bordas em botões primários** — apenas `bg-*` + texto branco
9. **Feedback visual obrigatório** — todo botão tem hover, todo loading tem spinner, todo save tem confirmação
10. **Labels em `text-xs`** — labels de campo sempre menores que o valor do campo (`text-sm`)
