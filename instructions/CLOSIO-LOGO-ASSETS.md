# Logo Closio - Monograma CO
## Todos os arquivos SVG e códigos para web

---

## 📦 ÍCONE ISOLADO (para favicon, app icon, mobile)

### SVG - Ícone 40x40px
```svg
<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- C -->
  <path d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32" stroke="#2b7fff" stroke-width="4" stroke-linecap="round" fill="none"/>
  <!-- O -->
  <circle cx="16" cy="20" r="12" stroke="#2b7fff" stroke-width="4" fill="none"/>
</svg>
```

### SVG - Ícone 512x512px (para favicon/app icon de alta resolução)
```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- C -->
  <path d="M 358.4 102.4 A 153.6 153.6 0 0 1 435.2 256 A 153.6 153.6 0 0 1 358.4 409.6" stroke="#2b7fff" stroke-width="51.2" stroke-linecap="round" fill="none"/>
  <!-- O -->
  <circle cx="204.8" cy="256" r="153.6" stroke="#2b7fff" stroke-width="51.2" fill="none"/>
</svg>
```

---

## 🎨 LOGO COMPLETO (ícone + texto)

### SVG - Logo Horizontal
```svg
<svg width="160" height="40" viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Ícone -->
  <path d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32" stroke="#2b7fff" stroke-width="4" stroke-linecap="round" fill="none"/>
  <circle cx="16" cy="20" r="12" stroke="#2b7fff" stroke-width="4" fill="none"/>
  
  <!-- Texto "closio" -->
  <text x="50" y="28" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="24" font-weight="700" fill="#2b7fff">closio</text>
</svg>
```

### SVG - Logo Horizontal (versão otimizada para web fonts)
```svg
<svg width="160" height="40" viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Ícone -->
  <path d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32" stroke="#2b7fff" stroke-width="4" stroke-linecap="round" fill="none"/>
  <circle cx="16" cy="20" r="12" stroke="#2b7fff" stroke-width="4" fill="none"/>
</svg>
```

---

## 💻 COMO USAR NO HTML/REACT

### 1. Como componente React (recomendado)
```jsx
// Logo.jsx
export function ClosioIcon({ size = 40, color = "#2b7fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path 
        d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32" 
        stroke={color} 
        strokeWidth="4" 
        strokeLinecap="round" 
        fill="none"
      />
      <circle cx="16" cy="20" r="12" stroke={color} strokeWidth="4" fill="none"/>
    </svg>
  );
}

export function ClosioLogo({ height = 40, color = "#2b7fff", showText = true }) {
  return (
    <div className="flex items-center gap-3">
      <ClosioIcon size={height} color={color} />
      {showText && (
        <span 
          className="text-2xl font-bold" 
          style={{ color, fontSize: `${height * 0.6}px` }}
        >
          closio
        </span>
      )}
    </div>
  );
}

// Uso:
<ClosioLogo height={40} />
<ClosioIcon size={24} /> {/* Apenas ícone */}
```

### 2. Como inline SVG no HTML
```html
<!-- Header com logo -->
<header>
  <a href="/" class="logo-container">
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <path d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32" stroke="#2b7fff" stroke-width="4" stroke-linecap="round" fill="none"/>
      <circle cx="16" cy="20" r="12" stroke="#2b7fff" stroke-width="4" fill="none"/>
    </svg>
    <span class="logo-text">closio</span>
  </a>
</header>

<style>
.logo-container {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
}

.logo-text {
  font-size: 24px;
  font-weight: 700;
  color: #2b7fff;
  font-family: Inter, system-ui, -apple-system, sans-serif;
}

/* Hover effect */
.logo-container:hover svg path,
.logo-container:hover svg circle {
  stroke: #1d5fbf;
}

.logo-container:hover .logo-text {
  color: #1d5fbf;
}
</style>
```

### 3. Como arquivo SVG externo
```html
<!-- Salve como closio-icon.svg e use assim: -->
<img src="/logo/closio-icon.svg" alt="Closio" width="40" height="40">

<!-- Ou com objeto (permite CSS styling): -->
<object data="/logo/closio-icon.svg" type="image/svg+xml" width="40" height="40">
  Closio
</object>
```

---

## 🖼️ FAVICON (ícone para aba do navegador)

### favicon.svg
```svg
<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32" stroke="#2b7fff" stroke-width="4" stroke-linecap="round" fill="none"/>
  <circle cx="16" cy="20" r="12" stroke="#2b7fff" stroke-width="4" fill="none"/>
</svg>
```

### No HTML
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
```

---

## 🎨 VARIAÇÕES DE COR

### Fundo escuro (versão branca)
```svg
<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
  <path d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none"/>
  <circle cx="16" cy="20" r="12" stroke="#ffffff" stroke-width="4" fill="none"/>
</svg>
```

### Versão com preenchimento (sólida)
```svg
<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
  <path d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32" stroke="#2b7fff" stroke-width="4" stroke-linecap="round" fill="none"/>
  <circle cx="16" cy="20" r="12" fill="#2b7fff"/>
</svg>
```

### Versão monocromática (para impressão)
```svg
<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
  <path d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32" stroke="#000000" stroke-width="4" stroke-linecap="round" fill="none"/>
  <circle cx="16" cy="20" r="12" stroke="#000000" stroke-width="4" fill="none"/>
</svg>
```

---

## 📱 TAMANHOS RECOMENDADOS

```css
/* Favicon */
.favicon { width: 16px; height: 16px; }
.favicon-retina { width: 32px; height: 32px; }

/* Header / Navbar */
.logo-header { width: 40px; height: 40px; }

/* Hero / Landing page */
.logo-hero { width: 80px; height: 80px; }

/* App icon (iOS/Android) */
.app-icon { width: 512px; height: 512px; }
```

---

## 🚀 NEXT.JS / REACT SETUP COMPLETO

### 1. Crie o componente
```jsx
// components/Logo.jsx
export function ClosioIcon({ size = 40, className = "" }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 40 40" 
      fill="none"
      className={className}
    >
      <path 
        d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32" 
        stroke="currentColor" 
        strokeWidth="4" 
        strokeLinecap="round" 
        fill="none"
      />
      <circle 
        cx="16" 
        cy="20" 
        r="12" 
        stroke="currentColor" 
        strokeWidth="4" 
        fill="none"
      />
    </svg>
  );
}

export default function ClosioLogo({ size = "md", showCRM = false }) {
  const sizes = {
    sm: { icon: 24, text: "text-lg" },
    md: { icon: 40, text: "text-2xl" },
    lg: { icon: 60, text: "text-4xl" }
  };
  
  const config = sizes[size];
  
  return (
    <div className="flex items-center gap-3">
      <ClosioIcon size={config.icon} className="text-[#2b7fff]" />
      <div className="flex flex-col">
        <span className={`${config.text} font-bold text-[#2b7fff]`}>
          closio
        </span>
        {showCRM && (
          <span className="text-xs text-gray-500 tracking-wider -mt-1">
            CRM
          </span>
        )}
      </div>
    </div>
  );
}
```

### 2. Use no código
```jsx
import ClosioLogo, { ClosioIcon } from '@/components/Logo';

// Header
<header>
  <ClosioLogo size="md" />
</header>

// Landing page
<ClosioLogo size="lg" showCRM />

// Favicon (apenas ícone)
<ClosioIcon size={32} />
```

---

## 📋 CSS UTILITIES

```css
/* Cores principais */
:root {
  --closio-primary: #2b7fff;
  --closio-primary-dark: #1d5fbf;
  --closio-primary-light: #5c9aff;
}

/* Classe helper para logos */
.closio-logo {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: var(--closio-primary);
  text-decoration: none;
}

.closio-logo:hover {
  color: var(--closio-primary-dark);
}

/* Animação sutil no hover */
.closio-logo svg {
  transition: transform 0.2s ease;
}

.closio-logo:hover svg {
  transform: scale(1.05);
}
```

---

## 💾 DOWNLOAD DOS ARQUIVOS

Crie esses arquivos no seu projeto:

### `/public/logo/closio-icon.svg`
```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 358.4 102.4 A 153.6 153.6 0 0 1 435.2 256 A 153.6 153.6 0 0 1 358.4 409.6" stroke="#2b7fff" stroke-width="51.2" stroke-linecap="round" fill="none"/>
  <circle cx="204.8" cy="256" r="153.6" stroke="#2b7fff" stroke-width="51.2" fill="none"/>
</svg>
```

### `/public/favicon.svg`
```svg
<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32" stroke="#2b7fff" stroke-width="4" stroke-linecap="round" fill="none"/>
  <circle cx="16" cy="20" r="12" stroke="#2b7fff" stroke-width="4" fill="none"/>
</svg>
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Criar componente `Logo.jsx` com ClosioIcon e ClosioLogo
- [ ] Adicionar `/public/favicon.svg`
- [ ] Adicionar `/public/logo/closio-icon.svg` (alta resolução)
- [ ] Atualizar `<link rel="icon">` no `<head>`
- [ ] Testar em diferentes tamanhos (16px, 24px, 40px, 80px)
- [ ] Testar em fundo claro e escuro
- [ ] Validar acessibilidade (alt text)
- [ ] Gerar PNG fallback para navegadores antigos (opcional)

---

## 🎯 EXEMPLOS DE USO

```jsx
// Navbar
<nav className="flex items-center justify-between p-4">
  <ClosioLogo size="md" />
  <button>Login</button>
</nav>

// Landing page hero
<div className="text-center">
  <ClosioLogo size="lg" showCRM />
  <h1>Unifique conversas. Feche mais negócios.</h1>
</div>

// Sidebar (app)
<aside className="w-64 bg-white border-r">
  <div className="p-4">
    <ClosioIcon size={32} />
  </div>
</aside>

// Email footer
<div style="text-align: center;">
  <img src="https://seusite.com/logo/closio-icon.svg" width="40" height="40" alt="Closio">
  <p style="color: #2b7fff; font-weight: bold; margin-top: 8px;">closio</p>
</div>
```

---

**Tudo pronto!** 🎉 Você tem agora tudo que precisa para usar o logo Closio no seu site.
