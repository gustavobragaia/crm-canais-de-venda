# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**OmniChannel CRM** is a white-label multi-tenant CRM platform that centralizes Instagram, Facebook, and WhatsApp conversations into a unified inbox. Built for service businesses (law firms, agencies, consultancies, clinics) to never miss a lead.

**Core Philosophy**: "Never lose a client due to slow response" - all social channels in one place with intelligent lead distribution.

**Target Locale**: pt-BR (Brazilian Portuguese)

**Key Value Proposition**: Client sends DM on Instagram/Facebook/WhatsApp → Message appears instantly in unified inbox → Admin assigns to best agent → Agent responds from CRM → Reply sent to original channel.

**Business Model**: White-label SaaS - sell to different businesses, each gets their own branded workspace.

## Build and Development Commands

### Backend

```bash
npm run dev          # Start development server with hot reload
npm run build        # Compile TypeScript
npm start            # Run compiled server
npm run lint         # ESLint
npm test             # Run Jest tests
npm run type-check   # TypeScript validation
npm run db:generate  # Generate Prisma schema
npm run db:push      # Push schema to database
npm run db:studio    # Open Prisma Studio
```

### Frontend

```bash
npm run dev          # Start Next.js dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # ESLint
npm run type-check   # TypeScript validation
```

### Testing Webhooks Locally

```bash
# Meta webhooks (WhatsApp, Instagram, Facebook)
ngrok http 3000
# Usar URL ngrok em Meta Developer Console

# Kirvano webhooks (configurar no painel Kirvano → Integrações → Webhooks)
# URL: https://SEU_DOMINIO/api/webhooks/kirvano
# Token: valor de KIRVANO_WEBHOOK_TOKEN
```

## Architecture

### Tech Stack

| Camada | Tecnologia | Função |
|--------|------------|--------|
| Frontend/Backend | Next.js 14 (App Router) | SSR, API routes, full-stack |
| Autenticação | NextAuth.js | Multi-workspace auth, session management |
| Banco de dados | PostgreSQL (Vercel Postgres) | Multi-tenant data with workspace isolation |
| Real-time | Pusher | Live message updates in inbox |
| Storage | Vercel Blob | Logo uploads, attachments |
| Queue | Inngest | Process webhooks async (avoid timeouts) |
| WhatsApp | Meta Cloud API | Send/receive messages |
| Instagram | Meta Graph API | Direct messages |
| Facebook | Meta Graph API | Messenger integration |
| Pagamentos | Stripe | Recurring billing per workspace |
| Deploy | Vercel | Serverless, edge functions, CI/CD |

### Key Patterns

**Multi-Tenant Architecture**:
- Every table has `workspaceId` foreign key
- RLS policies ensure workspace isolation
- Each workspace = 1 paying customer
- Subdomain or path-based routing: `escritorio-silva.omnicrm.com` or `omnicrm.com/escritorio-silva`

**Authentication Flow**:
- NextAuth with credentials provider
- Workspace selected at login (if user belongs to multiple)
- Session stores `userId` + `workspaceId` + `role`
- API routes verify workspace ownership

**Message Processing Pipeline**:
```
[Meta Webhook] → [Inngest Queue] → [Save to DB] → [Pusher Broadcast] → [UI Update]
                       ↓
            [Check assignment rules]
                       ↓
         [Auto-assign or notify admin]
```

**Real-time Updates**:
- Pusher channels per workspace: `workspace-${workspaceId}`
- Events: `new-message`, `message-sent`, `lead-assigned`, `status-changed`
- Frontend subscribes on mount, unsubscribes on unmount

**Design System** (Kommo-inspired, light mode only):

```typescript
colors: {
  primary: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    500: '#3B82F6',   // Main brand color (customizable per workspace)
    600: '#2563EB',
    700: '#1D4ED8'
  },
  gray: {
    50: '#F9FAFB',    // Background
    100: '#F3F4F6',   // Surface
    200: '#E5E7EB',   // Border
    400: '#9CA3AF',   // Text secondary
    700: '#374151',   // Text primary
    900: '#111827'    // Headings
  },
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  
  // Channel colors (not customizable - brand recognition)
  whatsapp: '#25D366',
  instagram: '#E4405F',
  facebook: '#1877F2'
}
```

**Typography**: Inter (UI), Roboto Mono (timestamps, IDs)

**Layout**: 
- Sidebar navigation (280px)
- Inbox: 3-column (conversations list | messages | lead details)
- Pipeline: Kanban board
- Analytics: Cards + charts grid

---

## Database Schema (PostgreSQL)

### Tables

```sql
-- ==================== WORKSPACES (Multi-tenant) ====================

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                         -- "Escritório Silva"
  slug TEXT UNIQUE NOT NULL,                  -- "escritorio-silva"
  
  -- Branding (white-label)
  logo_url TEXT,                              -- Vercel Blob URL
  primary_color TEXT DEFAULT '#3B82F6',       -- Hex color
  secondary_color TEXT DEFAULT '#10B981',
  
  -- Billing
  subscription_status TEXT DEFAULT 'TRIAL',   -- TRIAL, ACTIVE, CANCELED, EXPIRED
  kirvano_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
  
  -- Limits (based on plan)
  max_users INTEGER DEFAULT 4,                -- 1 admin + 3 agents
  max_conversations_per_month INTEGER DEFAULT 1000,
  conversations_this_month INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workspaces_slug ON workspaces(slug);

-- ==================== USERS ====================

CREATE TYPE user_role AS ENUM ('ADMIN', 'AGENT');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role user_role DEFAULT 'AGENT',
  avatar_url TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_active_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, email)
);

CREATE INDEX idx_users_workspace ON users(workspace_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(workspace_id, role);

-- ==================== CHANNELS ====================

CREATE TYPE channel_type AS ENUM ('WHATSAPP', 'INSTAGRAM', 'FACEBOOK');

CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  type channel_type NOT NULL,
  name TEXT NOT NULL,                         -- "WhatsApp Principal"
  
  -- Meta API credentials (encrypted at rest)
  access_token TEXT,                          -- Criptografado
  phone_number_id TEXT,                       -- Para WhatsApp
  phone_number TEXT,                          -- Display: +55 11 99999-9999
  page_id TEXT,                               -- Para Instagram/Facebook
  page_name TEXT,                             -- Display: @escritoriosilva
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  webhook_verified_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, type, phone_number_id),
  UNIQUE(workspace_id, type, page_id)
);

CREATE INDEX idx_channels_workspace ON channels(workspace_id);
CREATE INDEX idx_channels_type ON channels(workspace_id, type);

-- ==================== CONVERSATIONS ====================

CREATE TYPE conversation_status AS ENUM (
  'UNASSIGNED',      -- Novo, aguardando distribuição
  'ASSIGNED',        -- Atribuído a agente
  'IN_PROGRESS',     -- Em atendimento
  'WAITING_CLIENT',  -- Aguardando resposta do cliente
  'RESOLVED',        -- Resolvido
  'ARCHIVED'         -- Arquivado
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  
  -- Contact info
  contact_name TEXT NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  contact_photo_url TEXT,
  
  -- External ID (from WhatsApp/Instagram/Facebook)
  external_id TEXT NOT NULL,                  -- WhatsApp: phone number, IG/FB: PSID
  
  -- Assignment
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Status & Pipeline
  status conversation_status DEFAULT 'UNASSIGNED',
  pipeline_stage TEXT,                        -- "Novo Lead", "Em Atendimento", "Proposta Enviada", etc
  
  -- Metadata
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  
  -- Tags
  tags TEXT[] DEFAULT '{}',                   -- ['urgente', 'vip', 'trabalhista']
  
  -- Notes (internal only, not sent to client)
  internal_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, channel_id, external_id)
);

CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX idx_conversations_channel ON conversations(channel_id);
CREATE INDEX idx_conversations_assigned ON conversations(assigned_to);
CREATE INDEX idx_conversations_status ON conversations(workspace_id, status);
CREATE INDEX idx_conversations_unassigned ON conversations(workspace_id, status) WHERE status = 'UNASSIGNED';
CREATE INDEX idx_conversations_last_message ON conversations(workspace_id, last_message_at DESC);

-- ==================== MESSAGES ====================

CREATE TYPE message_direction AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE message_status AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED');

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Message content
  direction message_direction NOT NULL,
  content TEXT NOT NULL,
  
  -- Attachments (images, documents, audio)
  attachments JSONB DEFAULT '[]',             -- [{type: 'image', url: '...', filename: '...'}]
  
  -- Metadata
  external_id TEXT,                           -- Message ID from Meta
  status message_status DEFAULT 'SENT',
  
  -- Author (for outbound)
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Timestamps
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_workspace ON messages(workspace_id);
CREATE INDEX idx_messages_external ON messages(external_id);

-- ==================== PIPELINE STAGES ====================

CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,                         -- "Novo Lead"
  color TEXT DEFAULT '#3B82F6',               -- Hex color
  position INTEGER NOT NULL,                  -- Order in pipeline
  
  is_default BOOLEAN DEFAULT FALSE,           -- Stage for new conversations
  is_final BOOLEAN DEFAULT FALSE,             -- "Cliente Fechado", "Perdido"
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, name)
);

CREATE INDEX idx_pipeline_stages_workspace ON pipeline_stages(workspace_id, position);

-- ==================== LEADS (enhanced conversation tracking) ====================

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID UNIQUE NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Lead source
  source_channel channel_type NOT NULL,
  first_message TEXT,                         -- First message from client
  
  -- Lead qualification
  lead_score INTEGER,                         -- 0-100, calculated by rules
  qualification_notes TEXT,
  
  -- Conversion tracking
  converted_at TIMESTAMPTZ,                   -- When became client
  conversion_value DECIMAL(10,2),             -- Deal value
  lost_at TIMESTAMPTZ,
  lost_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_workspace ON leads(workspace_id);
CREATE INDEX idx_leads_converted ON leads(workspace_id, converted_at) WHERE converted_at IS NOT NULL;

-- ==================== ANALYTICS ====================

CREATE TABLE analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Conversations
  new_conversations INTEGER DEFAULT 0,
  conversations_resolved INTEGER DEFAULT 0,
  conversations_active INTEGER DEFAULT 0,
  
  -- Messages
  messages_received INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  
  -- Response time (seconds)
  avg_first_response_time INTEGER,
  avg_response_time INTEGER,
  
  -- By channel
  whatsapp_conversations INTEGER DEFAULT 0,
  instagram_conversations INTEGER DEFAULT 0,
  facebook_conversations INTEGER DEFAULT 0,
  
  -- By agent
  agent_stats JSONB DEFAULT '{}',             -- {userId: {messages_sent: 10, avg_response: 120}}
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, date)
);

CREATE INDEX idx_analytics_workspace_date ON analytics_daily(workspace_id, date DESC);

-- ==================== WEBHOOK LOGS (debugging) ====================

CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  
  source TEXT NOT NULL,                       -- 'whatsapp', 'instagram', 'facebook', 'kirvano'
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  
  status TEXT DEFAULT 'PENDING',              -- PENDING, PROCESSED, FAILED
  error TEXT,
  processed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_workspace ON webhook_logs(workspace_id, created_at DESC);
CREATE INDEX idx_webhook_logs_status ON webhook_logs(status) WHERE status = 'PENDING';

-- ==================== SUBSCRIPTION PLANS ====================

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                         -- "Starter", "Pro", "Enterprise"
  slug TEXT UNIQUE NOT NULL,
  
  -- Pricing
  price_monthly_cents INTEGER NOT NULL,       -- 19700 = R$197,00
  price_annual_cents INTEGER,                 -- NULL if no annual option
  kirvano_price_id_monthly TEXT,
  kirvano_price_id_annual TEXT,
  
  -- Limits
  max_users INTEGER NOT NULL,
  max_conversations_per_month INTEGER NOT NULL,
  max_channels INTEGER NOT NULL,
  
  -- Features
  features JSONB DEFAULT '[]',                -- ["analytics", "api_access", "custom_domain"]
  
  is_active BOOLEAN DEFAULT TRUE,
  position INTEGER NOT NULL,                  -- Display order
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plans_active ON plans(is_active, position);
```

### RLS Policies (Workspace Isolation)

```sql
-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;

-- Users can only see their workspace's data
CREATE POLICY "users_own_workspace" ON users
  FOR ALL USING (workspace_id = current_setting('app.workspace_id')::UUID);

CREATE POLICY "conversations_own_workspace" ON conversations
  FOR ALL USING (workspace_id = current_setting('app.workspace_id')::UUID);

CREATE POLICY "messages_own_workspace" ON messages
  FOR ALL USING (workspace_id = current_setting('app.workspace_id')::UUID);

-- etc. for all tables
```

---

## API Endpoints

### Public

```
GET  /api/health                             # Health check
POST /api/webhooks/whatsapp                  # WhatsApp Cloud API webhook
POST /api/webhooks/instagram                 # Instagram webhook
POST /api/webhooks/facebook                  # Facebook Messenger webhook
POST /api/webhooks/kirvano                   # Kirvano billing webhook
GET  /api/webhooks/meta/verify               # Meta webhook verification (challenge)
```

### Authenticated (requires session)

```
# Auth
POST /api/auth/login                         # Login (email + password)
POST /api/auth/logout                        # Logout
GET  /api/auth/session                       # Get current session
POST /api/auth/switch-workspace              # Switch workspace (if user has multiple)

# Dashboard
GET  /api/dashboard                          # Stats: unassigned, active, avg response time

# Conversations / Inbox
GET  /api/conversations                      # List conversations (filters: status, assignedTo, channel)
GET  /api/conversations/:id                  # Get conversation with messages
POST /api/conversations/:id/assign           # Assign to agent (admin only)
PATCH /api/conversations/:id/status          # Update status
PATCH /api/conversations/:id/stage           # Move to pipeline stage
POST /api/conversations/:id/tag              # Add tag
DELETE /api/conversations/:id/tag            # Remove tag
PATCH /api/conversations/:id/notes           # Update internal notes
POST /api/conversations/:id/archive          # Archive conversation

# Messages
GET  /api/conversations/:id/messages         # Get messages (paginated)
POST /api/conversations/:id/messages         # Send message
POST /api/messages/:id/read                  # Mark as read

# Leads
GET  /api/leads                              # List leads (filters: converted, lost, dateRange)
GET  /api/leads/:id                          # Get lead details
PATCH /api/leads/:id/qualify                 # Update qualification
POST /api/leads/:id/convert                  # Mark as converted
POST /api/leads/:id/lost                     # Mark as lost

# Users (admin only)
GET  /api/users                              # List workspace users
POST /api/users                              # Invite new user
PATCH /api/users/:id                         # Update user
DELETE /api/users/:id                        # Deactivate user

# Channels (admin only)
GET  /api/channels                           # List connected channels
POST /api/channels/whatsapp/connect          # Connect WhatsApp account
POST /api/channels/instagram/connect         # Connect Instagram account
POST /api/channels/facebook/connect          # Connect Facebook account
PATCH /api/channels/:id                      # Update channel settings
DELETE /api/channels/:id                     # Disconnect channel

# Pipeline
GET  /api/pipeline/stages                    # Get stages
POST /api/pipeline/stages                    # Create stage (admin only)
PATCH /api/pipeline/stages/:id               # Update stage (admin only)
DELETE /api/pipeline/stages/:id              # Delete stage (admin only)
PATCH /api/pipeline/stages/reorder           # Reorder stages (admin only)

# Analytics
GET  /api/analytics/overview                 # High-level metrics
GET  /api/analytics/conversations            # Conversations over time
GET  /api/analytics/agents                   # Agent performance
GET  /api/analytics/channels                 # Channel breakdown
GET  /api/analytics/response-times           # Response time trends

# Workspace Settings (admin only)
GET  /api/workspace                          # Get workspace settings
PATCH /api/workspace/branding                # Update logo/colors
PATCH /api/workspace/settings                # Update general settings

# Billing
POST /api/billing/checkout                   # Create Stripe checkout session
POST /api/billing/portal                     # Get customer portal URL
GET  /api/billing/subscription               # Get current subscription
```

---

## Critical Business Rules

### 1. Multi-Tenant Isolation

**ABSOLUTE RULE**: Data from one workspace MUST NEVER leak to another.

```typescript
// Every database query MUST include workspace filter
async function getConversations(workspaceId: string, filters: Filters) {
  return await db.conversation.findMany({
    where: {
      workspaceId,  // CRITICAL - always filter by workspace
      ...filters
    }
  });
}

// Set RLS context at request start
async function middleware(req: NextRequest) {
  const session = await getSession(req);
  await db.$executeRaw`SET app.workspace_id = ${session.workspaceId}`;
}
```

### 2. Role-Based Permissions

```typescript
type Role = 'ADMIN' | 'AGENT';

const PERMISSIONS = {
  ADMIN: {
    viewAllConversations: true,
    assignConversations: true,
    manageUsers: true,
    manageChannels: true,
    configurePipeline: true,
    viewAnalytics: true,
    manageWorkspace: true,
    manageBilling: true
  },
  AGENT: {
    viewAllConversations: false,    // Only assigned
    assignConversations: false,     // Cannot assign
    manageUsers: false,
    manageChannels: false,
    configurePipeline: false,
    viewAnalytics: false,           // Only own stats
    manageWorkspace: false,
    manageBilling: false
  }
};

// Middleware para proteger rotas
function requireAdmin(req: NextRequest) {
  const session = await getSession(req);
  if (session.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }
}
```

### 3. Meta Webhook Processing

```typescript
// CRITICAL: Respond to Meta within 20 seconds or they'll retry
async function handleWhatsAppWebhook(payload: WhatsAppWebhook) {
  // 1. Verify signature (security)
  verifyWebhookSignature(payload, req.headers['x-hub-signature-256']);
  
  // 2. Immediately return 200 OK
  res.status(200).send('EVENT_RECEIVED');
  
  // 3. Process async via queue (Inngest)
  await inngest.send({
    name: 'whatsapp/message.received',
    data: payload
  });
}

// Inngest function processes slowly
inngest.createFunction(
  { id: 'process-whatsapp-message' },
  { event: 'whatsapp/message.received' },
  async ({ event }) => {
    const { phone_number_id, message } = event.data;
    
    // Find channel
    const channel = await getChannelByPhoneNumberId(phone_number_id);
    
    // Find or create conversation
    const conversation = await findOrCreateConversation({
      workspaceId: channel.workspaceId,
      channelId: channel.id,
      externalId: message.from,
      contactName: message.profile?.name || message.from
    });
    
    // Save message
    await saveMessage({
      conversationId: conversation.id,
      direction: 'INBOUND',
      content: message.text?.body || '[Media]',
      externalId: message.id
    });
    
    // Update conversation
    await updateConversation(conversation.id, {
      lastMessageAt: new Date(),
      lastMessagePreview: truncate(message.text?.body, 100),
      unreadCount: { increment: 1 }
    });
    
    // Broadcast via Pusher
    await pusher.trigger(`workspace-${channel.workspaceId}`, 'new-message', {
      conversationId: conversation.id,
      message
    });
    
    // Auto-assign if rules exist
    await applyAssignmentRules(conversation);
  }
);
```

### 4. Real-time with Pusher

```typescript
// Server-side: broadcast events
await pusher.trigger(`workspace-${workspaceId}`, 'new-message', {
  conversationId,
  message
});

await pusher.trigger(`workspace-${workspaceId}`, 'conversation-assigned', {
  conversationId,
  assignedTo: { id, name, avatarUrl }
});

// Client-side: subscribe to workspace channel
useEffect(() => {
  const channel = pusher.subscribe(`workspace-${workspaceId}`);
  
  channel.bind('new-message', (data) => {
    // Update conversation list
    queryClient.invalidateQueries(['conversations']);
    
    // If conversation is open, append message
    if (selectedConversationId === data.conversationId) {
      queryClient.setQueryData(
        ['messages', data.conversationId],
        (old) => [...old, data.message]
      );
    }
  });
  
  channel.bind('conversation-assigned', (data) => {
    queryClient.invalidateQueries(['conversations']);
    toast.success(`Conversa atribuída para ${data.assignedTo.name}`);
  });
  
  return () => {
    channel.unbind_all();
    pusher.unsubscribe(`workspace-${workspaceId}`);
  };
}, [workspaceId]);
```

### 5. Message Sending (Outbound)

```typescript
async function sendMessage(
  conversationId: string,
  content: string,
  sentBy: string
) {
  const conversation = await getConversation(conversationId);
  const channel = await getChannel(conversation.channelId);
  
  let externalId: string;
  
  // Send via appropriate API
  switch (channel.type) {
    case 'WHATSAPP':
      externalId = await sendWhatsAppMessage(
        channel.phoneNumberId,
        conversation.externalId, // recipient phone
        content,
        channel.accessToken
      );
      break;
      
    case 'INSTAGRAM':
      externalId = await sendInstagramMessage(
        conversation.externalId, // PSID
        content,
        channel.accessToken
      );
      break;
      
    case 'FACEBOOK':
      externalId = await sendFacebookMessage(
        conversation.externalId, // PSID
        content,
        channel.accessToken
      );
      break;
  }
  
  // Save to database
  const message = await saveMessage({
    conversationId,
    direction: 'OUTBOUND',
    content,
    externalId,
    sentBy,
    status: 'SENT'
  });
  
  // Update conversation
  await updateConversation(conversationId, {
    lastMessageAt: new Date(),
    lastMessagePreview: content,
    status: 'IN_PROGRESS'
  });
  
  // Broadcast
  await pusher.trigger(`workspace-${conversation.workspaceId}`, 'message-sent', {
    conversationId,
    message
  });
  
  return message;
}
```

### 6. Channel Icons & Branding

```typescript
// Channel-specific styling (not customizable)
const CHANNEL_STYLES = {
  WHATSAPP: {
    color: '#25D366',
    icon: 'MessageCircle',  // lucide-react
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200'
  },
  INSTAGRAM: {
    color: '#E4405F',
    icon: 'Instagram',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-200'
  },
  FACEBOOK: {
    color: '#1877F2',
    icon: 'Facebook',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200'
  }
};

// Display in conversation list
<div className={`flex items-center gap-2 p-3 ${CHANNEL_STYLES[conversation.channel.type].bgColor}`}>
  <Icon 
    name={CHANNEL_STYLES[conversation.channel.type].icon}
    color={CHANNEL_STYLES[conversation.channel.type].color}
    size={20}
  />
  <div>
    <p className="font-medium">{conversation.contactName}</p>
    <p className="text-sm text-gray-500">{conversation.lastMessagePreview}</p>
  </div>
</div>
```

### 7. Onboarding Flow

```typescript
// Step 1: Create workspace
async function createWorkspace(data: {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
}) {
  const workspace = await db.workspace.create({
    data: {
      name: data.name,
      slug: data.slug,
      subscriptionStatus: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
    }
  });
  
  const admin = await db.user.create({
    data: {
      workspaceId: workspace.id,
      email: data.adminEmail,
      passwordHash: await bcrypt.hash(data.adminPassword, 10),
      name: data.adminName,
      role: 'ADMIN'
    }
  });
  
  // Create default pipeline stages
  await db.pipelineStage.createMany({
    data: [
      { workspaceId: workspace.id, name: 'Novo Lead', position: 0, isDefault: true },
      { workspaceId: workspace.id, name: 'Em Atendimento', position: 1 },
      { workspaceId: workspace.id, name: 'Proposta Enviada', position: 2 },
      { workspaceId: workspace.id, name: 'Cliente Fechado', position: 3, isFinal: true },
      { workspaceId: workspace.id, name: 'Perdido', position: 4, isFinal: true }
    ]
  });
  
  return { workspace, admin };
}

// Step 2: Upload branding (optional)
async function uploadBranding(workspaceId: string, logo: File, colors: {
  primary: string;
  secondary: string;
}) {
  const logoUrl = await uploadToBlob(logo);
  
  await db.workspace.update({
    where: { id: workspaceId },
    data: {
      logoUrl,
      primaryColor: colors.primary,
      secondaryColor: colors.secondary
    }
  });
}

// Step 3: Add team members (optional)
async function inviteUsers(workspaceId: string, users: Array<{
  email: string;
  name: string;
  role: 'ADMIN' | 'AGENT';
}>) {
  // Send invite emails with temp password
  for (const user of users) {
    const tempPassword = generateTempPassword();
    
    await db.user.create({
      data: {
        workspaceId,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash: await bcrypt.hash(tempPassword, 10)
      }
    });
    
    await sendInviteEmail(user.email, tempPassword);
  }
}

// Step 4: Connect channels (optional, can skip)
// User clicks "Connect WhatsApp", redirected to Meta OAuth, etc.
```

### 8. Subscription Limits

```typescript
// Check before creating conversation
async function canCreateConversation(workspaceId: string): Promise<boolean> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      conversationsThisMonth: true,
      maxConversationsPerMonth: true,
      subscriptionStatus: true,
      trialEndsAt: true
    }
  });
  
  // Check trial
  if (workspace.subscriptionStatus === 'TRIAL') {
    if (new Date() > workspace.trialEndsAt) {
      return false; // Trial expired
    }
  }
  
  // Check active subscription
  if (workspace.subscriptionStatus !== 'ACTIVE' && workspace.subscriptionStatus !== 'TRIAL') {
    return false;
  }
  
  // Check limit
  return workspace.conversationsThisMonth < workspace.maxConversationsPerMonth;
}

// Increment counter (in webhook processing)
async function incrementConversationCounter(workspaceId: string) {
  await db.workspace.update({
    where: { id: workspaceId },
    data: {
      conversationsThisMonth: { increment: 1 }
    }
  });
}

// Reset counter monthly (cron job)
async function resetMonthlyCounters() {
  await db.workspace.updateMany({
    data: {
      conversationsThisMonth: 0
    }
  });
}
```

---

## Environment Variables

```bash
# App
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:pass@host:5432/omnicrm

# NextAuth
NEXTAUTH_SECRET=your-secret-key-min-32-chars
NEXTAUTH_URL=http://localhost:3000

# Pusher (real-time)
PUSHER_APP_ID=your-app-id
PUSHER_KEY=your-key
PUSHER_SECRET=your-secret
PUSHER_CLUSTER=us2
NEXT_PUBLIC_PUSHER_KEY=your-key
NEXT_PUBLIC_PUSHER_CLUSTER=us2

# Meta / WhatsApp
WHATSAPP_ACCESS_TOKEN=stored-per-channel
WHATSAPP_VERIFY_TOKEN=random-string-for-webhook-verification
INSTAGRAM_ACCESS_TOKEN=stored-per-channel
FACEBOOK_ACCESS_TOKEN=stored-per-channel

# Inngest (queue)
INNGEST_EVENT_KEY=your-event-key
INNGEST_SIGNING_KEY=your-signing-key

# Kirvano
KIRVANO_WEBHOOK_TOKEN=your-kirvano-webhook-token
NEXT_PUBLIC_KIRVANO_STARTER_URL=https://pay.kirvano.com/4f4bf484-0113-4257-8199-52f7fa0f5925
NEXT_PUBLIC_KIRVANO_PRO_URL=https://pay.kirvano.com/9ff16802-c829-46e8-a7b1-efc922ff5166
NEXT_PUBLIC_KIRVANO_ENTERPRISE_URL=https://pay.kirvano.com/28bdff0e-b8c0-4c72-ba34-ee8b9828fe0f

# Vercel Blob (logo uploads)
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# Encryption (for storing access tokens)
ENCRYPTION_KEY=32-byte-random-key
```

---

## Frontend Routes

```typescript
// Public
/                           # Landing page
/login                      # Login (email/password)
/signup                     # Create workspace (onboarding)
/pricing                    # Plans & pricing

// Onboarding (after signup)
/onboarding/branding        # Upload logo, choose colors
/onboarding/team            # Add team members
/onboarding/channels        # Connect channels (optional)

// Authenticated (requires session)
/[workspaceSlug]/inbox                    # Main inbox (3-column)
/[workspaceSlug]/inbox?status=unassigned  # Filter unassigned
/[workspaceSlug]/inbox?assignedTo=me      # My conversations
/[workspaceSlug]/leads                    # Leads list
/[workspaceSlug]/pipeline                 # Kanban board
/[workspaceSlug]/analytics                # Dashboard with charts
/[workspaceSlug]/settings                 # Workspace settings (admin only)
/[workspaceSlug]/settings/team            # Manage users (admin only)
/[workspaceSlug]/settings/channels        # Connect/manage channels (admin only)
/[workspaceSlug]/settings/pipeline        # Configure pipeline stages (admin only)
/[workspaceSlug]/settings/billing         # Manage subscription (admin only)
/[workspaceSlug]/profile                  # User profile
```

---

## Code Conventions

### General

- TypeScript strict mode
- Prefer named exports
- Use absolute imports with `@/` prefix
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

### API Routes (Next.js App Router)

```typescript
// app/api/conversations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  
  const conversations = await db.conversation.findMany({
    where: {
      workspaceId: session.workspaceId,
      ...(status && { status }),
      ...(session.role === 'AGENT' && { assignedTo: session.userId })
    },
    include: {
      channel: true,
      assignedTo: {
        select: { id: true, name: true, avatarUrl: true }
      }
    },
    orderBy: {
      lastMessageAt: 'desc'
    }
  });
  
  return NextResponse.json(conversations);
}
```

### React Components

```typescript
// Always use function components with TypeScript
interface ConversationListItemProps {
  conversation: ConversationWithChannel;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export function ConversationListItem({ 
  conversation, 
  isSelected,
  onSelect 
}: ConversationListItemProps) {
  const channelStyle = CHANNEL_STYLES[conversation.channel.type];
  
  return (
    <div 
      className={clsx(
        'p-4 border-b cursor-pointer hover:bg-gray-50',
        isSelected && 'bg-blue-50 border-l-4 border-l-blue-500'
      )}
      onClick={() => onSelect(conversation.id)}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${channelStyle.bgColor}`}>
          <Icon 
            name={channelStyle.icon} 
            size={20}
            color={channelStyle.color}
          />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium truncate">{conversation.contactName}</p>
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(conversation.lastMessageAt)}
            </span>
          </div>
          
          <p className="text-sm text-gray-600 truncate">
            {conversation.lastMessagePreview}
          </p>
          
          {conversation.unreadCount > 0 && (
            <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-500 text-white rounded-full">
              {conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Error Handling

```typescript
// Structured errors
class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: Record<string, any>
  ) {
    super(message);
  }
}

// Usage
throw new AppError(
  'Limite de conversas atingido',
  'CONVERSATION_LIMIT_REACHED',
  403,
  { limit: workspace.maxConversationsPerMonth, current: workspace.conversationsThisMonth }
);
```

---

## MVP Build Order

### Semana 1: Foundation + Auth

- [ ] Setup Next.js 14 + TypeScript + Tailwind
- [ ] Configure NextAuth (credentials provider)
- [ ] Database schema (Prisma)
- [ ] Migrations
- [ ] Basic layout (sidebar, header)
- [ ] Login/signup pages
- [ ] Session management

### Semana 2: Onboarding + Multi-tenant

- [ ] Workspace creation flow
- [ ] Logo upload (Vercel Blob)
- [ ] Color picker for branding
- [ ] Team member invitation
- [ ] Preview of branded interface
- [ ] Workspace switcher (if user has multiple)

### Semana 3: Inbox + Real-time

- [ ] Conversation list component
- [ ] Message thread component
- [ ] Send message UI
- [ ] Pusher integration (real-time updates)
- [ ] Unread counter
- [ ] Channel icons/badges
- [ ] Filter by status/assignee

### Semana 4: Meta Integrations

- [ ] WhatsApp Cloud API setup
- [ ] WhatsApp webhook handler
- [ ] Instagram Graph API setup
- [ ] Instagram webhook handler
- [ ] Facebook Messenger setup
- [ ] Facebook webhook handler
- [ ] Inngest queue for async processing
- [ ] Channel connection UI (OAuth flow)

### Semana 5: Assignment + Pipeline

- [ ] Manual assignment (admin → agent)
- [ ] Auto-assignment rules (optional)
- [ ] Pipeline stages CRUD
- [ ] Kanban board view
- [ ] Drag & drop to move stages
- [ ] Status update UI
- [ ] Internal notes

### Semana 6: Analytics + Polish

- [ ] Dashboard stats (cards)
- [ ] Response time calculation
- [ ] Charts (conversations over time, by channel, by agent)
- [ ] Agent performance leaderboard
- [ ] Export reports (CSV)
- [ ] Loading states
- [ ] Error handling
- [ ] Toast notifications

### Semana 7: Billing

- [ ] Stripe integration
- [ ] Plans setup in Stripe
- [ ] Checkout session creation
- [ ] Subscription webhook handlers
- [ ] Customer portal link
- [ ] Trial countdown UI
- [ ] Usage limits enforcement

### Semana 8: Launch Prep

- [ ] Landing page
- [ ] Pricing page
- [ ] Mobile responsive
- [ ] Performance optimization
- [ ] Security audit (SQL injection, XSS, CSRF)
- [ ] Documentation
- [ ] Deploy to Vercel
- [ ] Setup custom domain

---

## Testing Strategy

### Unit Tests

- Webhook signature verification
- Message parsing (WhatsApp/Instagram/Facebook formats)
- Permission checks (admin vs agent)
- Subscription limit validation

### Integration Tests

- Complete message flow: webhook → save → broadcast → UI update
- Stripe subscription lifecycle
- Multi-workspace isolation
- Real-time event delivery

### Manual Testing Checklist

- [ ] Signup creates workspace correctly
- [ ] Logo upload works and displays
- [ ] Custom colors apply to UI
- [ ] WhatsApp message arrives in inbox
- [ ] Instagram DM arrives in inbox
- [ ] Facebook message arrives in inbox
- [ ] Admin can assign conversation
- [ ] Agent sees only assigned conversations
- [ ] Real-time updates work (open 2 browsers)
- [ ] Send message goes to correct channel
- [ ] Pipeline drag & drop works
- [ ] Analytics show correct data
- [ ] Stripe checkout creates subscription
- [ ] Trial expiration blocks access
- [ ] Webhook retries don't duplicate messages

---

## Common Gotchas

1. **Meta Webhook Verification**: Must respond to `?hub.challenge` GET request on first setup
2. **Pusher Channels**: Use `workspace-${id}` format to avoid leaks between workspaces
3. **Message Deduplication**: Use `externalId` (Meta message ID) to prevent duplicates on webhook retries
4. **Access Token Storage**: Encrypt with AES-256 before storing in database
5. **RLS Context**: Set `app.workspace_id` at request start, not in every query
6. **Inngest Timeout**: Keep functions under 5 minutes or use step functions
7. **Stripe Webhooks**: Verify signature to prevent spoofing
8. **Multi-workspace Users**: Handle workspace switching in session
9. **Rate Limits**: Meta APIs have limits - implement exponential backoff
10. **Message Order**: Sort by `createdAt` not `id` to ensure chronological order

---

## Deployment Notes

### Vercel

```bash
# Environment variables
# Add all from .env in Vercel dashboard

# Build settings
Framework Preset: Next.js
Build Command: npm run build
Output Directory: .next
Install Command: npm install

# Domains
Production: omnicrm.com
Preview: *.omnicrm.com (for workspace subdomains)
```

### Database (Vercel Postgres or Supabase)

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tables (run migrations)
npm run db:push

-- Setup cron for monthly reset
-- Vercel Cron or Supabase pg_cron
SELECT cron.schedule(
  'reset-monthly-counters',
  '0 0 1 * *',  -- 1st of every month at midnight
  $$
    UPDATE workspaces SET conversations_this_month = 0;
  $$
);
```

### Meta Developer Console

1. Create app at developers.facebook.com
2. Add WhatsApp, Instagram, and Messenger products
3. Configure webhooks:
   - Callback URL: `https://omnicrm.com/api/webhooks/whatsapp`
   - Verify token: `your-verify-token`
   - Subscribe to: `messages`
4. Generate access tokens (stored per channel in database)
5. Submit for App Review (required for production)

### Pusher

```bash
# Create app at pusher.com
# Select cluster closest to users (us2, eu, ap3)
# Copy credentials to .env
```

### Stripe

```bash
# Planos (links fixos no Kirvano):
# Starter: R$197/mês — https://pay.kirvano.com/4f4bf484-0113-4257-8199-52f7fa0f5925
# Pro: R$397/mês     — https://pay.kirvano.com/9ff16802-c829-46e8-a7b1-efc922ff5166
# Enterprise: R$697/mês — https://pay.kirvano.com/28bdff0e-b8c0-4c72-ba34-ee8b9828fe0f

# Setup webhook no painel Kirvano → Integrações → Webhooks
# URL: https://omnicrm.com/api/webhooks/kirvano
# Eventos: SALE_APPROVED, SALE_REFUSED, SUBSCRIPTION_CANCELED, SUBSCRIPTION_RENEWED,
#          SUBSCRIPTION_OVERDUE, SALE_CHARGEBACK, REFUND
```

---

## Quick Start for Claude Code

To start development:

1. **Read this CLAUDE.md completely**
2. **Setup project**:
   ```bash
   npx create-next-app@latest omnicrm --typescript --tailwind --app
   cd omnicrm
   npm install prisma @prisma/client next-auth bcrypt pusher pusher-js inngest
   npm install -D @types/bcrypt
   ```
3. **Create folder structure**:
   ```
   app/
   ├── (auth)/
   │   ├── login/page.tsx
   │   └── signup/page.tsx
   ├── (onboarding)/
   │   └── onboarding/
   ├── [workspaceSlug]/
   │   ├── inbox/page.tsx
   │   ├── leads/page.tsx
   │   ├── pipeline/page.tsx
   │   ├── analytics/page.tsx
   │   └── settings/
   └── api/
       ├── auth/
       ├── conversations/
       ├── messages/
       ├── webhooks/
       └── billing/
   components/
   ├── inbox/
   ├── layout/
   └── ui/
   lib/
   ├── db/
   ├── auth.ts
   ├── pusher.ts
   └── integrations/
       ├── whatsapp.ts
       ├── instagram.ts
       └── facebook.ts
   ```
4. **Initialize Prisma**:
   ```bash
   npx prisma init
   # Copy schema from CLAUDE.md
   npx prisma db push
   ```
5. **Follow MVP Build Order** in exact sequence
6. **Test multi-tenant isolation** extensively - critical for security
7. **Test real-time** with 2 browsers open simultaneously

**Most Critical Files**:
- `/prisma/schema.prisma` - Database schema
- `/lib/auth.ts` - Session + permissions
- `/lib/integrations/whatsapp.ts` - WhatsApp API
- `/app/api/webhooks/whatsapp/route.ts` - Webhook handler
- `/app/[workspaceSlug]/inbox/page.tsx` - Main inbox UI
- `/components/inbox/ConversationList.tsx` - Conversation list with channel icons

---

*OmniChannel CRM - CLAUDE.md - Versão 1.0 - Março 2026*
