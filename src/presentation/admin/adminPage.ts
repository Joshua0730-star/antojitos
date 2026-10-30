export function adminPageHtml(): string {
  return `<!DOCTYPE html>

<html class="h-full bg-background text-on-surface antialiased" lang="es"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Centro de control - Antojitos</title>
<!-- Google Fonts: Plus Jakarta Sans -->
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&amp;display=swap" rel="stylesheet"/>
<!-- Material Symbols Outlined -->
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<!-- Tailwind CSS CDN -->
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<script id="tailwind-config">
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            "surface-container-high": "#dee9fc",
            "on-error-container": "#93000a",
            "tertiary-container": "#007650",
            "on-tertiary": "#ffffff",
            "inverse-primary": "#d2bbff",
            "background": "#f8f9ff",
            "on-secondary-fixed-variant": "#464555",
            "primary-container": "#7c3aed",
            "secondary-fixed": "#e4e0f5",
            "on-error": "#ffffff",
            "surface-container-highest": "#d9e3f6",
            "on-surface-variant": "#4a4455",
            "surface-dim": "#d0dbed",
            "surface-variant": "#d9e3f6",
            "on-secondary-fixed": "#1b1a29",
            "tertiary": "#005b3d",
            "tertiary-fixed": "#6ffbbe",
            "outline": "#7b7487",
            "inverse-on-surface": "#eaf1ff",
            "on-primary-fixed-variant": "#5a00c6",
            "surface": "#f8f9ff",
            "on-tertiary-container": "#76ffc2",
            "surface-bright": "#f8f9ff",
            "on-primary-fixed": "#25005a",
            "on-background": "#121c2a",
            "on-surface": "#121c2a",
            "inverse-surface": "#27313f",
            "surface-container-lowest": "#ffffff",
            "surface-tint": "#732ee4",
            "secondary": "#5e5c6e",
            "surface-container": "#e6eeff",
            "on-tertiary-fixed": "#002113",
            "on-primary": "#ffffff",
            "on-secondary-container": "#646274",
            "error": "#ba1a1a",
            "primary-fixed-dim": "#d2bbff",
            "error-container": "#ffdad6",
            "secondary-container": "#e4e0f5",
            "secondary-fixed-dim": "#c7c4d8",
            "on-tertiary-fixed-variant": "#005236",
            "primary": "#630ed4",
            "surface-container-low": "#eff4ff",
            "outline-variant": "#ccc3d8",
            "tertiary-fixed-dim": "#4edea3",
            "on-secondary": "#ffffff",
            "on-primary-container": "#ede0ff",
            "primary-fixed": "#eaddff"
          },
          borderRadius: {
            "DEFAULT": "0.25rem",
            "lg": "0.5rem",
            "xl": "0.75rem",
            "full": "9999px"
          },
          spacing: {
            "gutter": "1.5rem",
            "space-md": "1rem",
            "margin": "2rem",
            "margin-mobile": "1rem",
            "space-sm": "0.5rem",
            "space-xl": "2rem",
            "space-xs": "0.25rem",
            "space-lg": "1.5rem",
            "gutter-mobile": "1rem"
          },
          fontFamily: {
            "label-lg": ["Plus Jakarta Sans"],
            "body-sm": ["Plus Jakarta Sans"],
            "headline-md": ["Plus Jakarta Sans"],
            "label-md": ["Plus Jakarta Sans"],
            "title-md": ["Plus Jakarta Sans"],
            "headline-xl-mobile": ["Plus Jakarta Sans"],
            "body-md": ["Plus Jakarta Sans"],
            "label-sm": ["Plus Jakarta Sans"],
            "headline-lg": ["Plus Jakarta Sans"],
            "headline-xl": ["Plus Jakarta Sans"],
            "body-lg": ["Plus Jakarta Sans"],
            "title-lg": ["Plus Jakarta Sans"]
          },
          fontSize: {
            "label-lg": ["14px", { lineHeight: "20px", fontWeight: "600" }],
            "body-sm": ["13px", { lineHeight: "18px", fontWeight: "400" }],
            "headline-md": ["20px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
            "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "600" }],
            "title-md": ["16px", { lineHeight: "22px", fontWeight: "600" }],
            "headline-xl-mobile": ["26px", { lineHeight: "34px", letterSpacing: "-0.01em", fontWeight: "700" }],
            "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
            "label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.03em", fontWeight: "500" }],
            "headline-lg": ["24px", { lineHeight: "32px", letterSpacing: "-0.015em", fontWeight: "600" }],
            "headline-xl": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" }],
            "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
            "title-lg": ["18px", { lineHeight: "24px", fontWeight: "600" }]
          }
        },
      },
    }
  </script>
</head>
<body class="min-h-screen bg-background text-on-surface flex flex-col font-body-md selection:bg-secondary-container selection:text-primary">
<!-- TOP APP BAR -->
<header class="sticky top-0 z-40 w-full bg-surface-container-lowest">
<div class="flex justify-between items-center px-6 py-3 w-full max-w-7xl mx-auto">
<!-- Left Brand & Status text -->
<div class="flex items-center gap-4">
<div class="flex items-center gap-2">
<button id="restaurantLogoBtn" type="button" onclick="openLogoModal()" title="Cambiar logo del restaurante" class="group relative w-9 h-9 rounded-lg bg-secondary-container flex items-center justify-center text-primary font-bold text-lg cursor-pointer overflow-hidden border border-outline-variant/60 hover:ring-2 hover:ring-primary-container transition-all active:scale-95">
            <img id="brandLogo" class="hidden w-full h-full object-cover" alt="Logo de Antojitos"/><span id="brandFallback">🥟</span><span class="absolute inset-0 bg-on-surface/40 flex items-center justify-center text-on-primary opacity-0 group-hover:opacity-100 transition-opacity"><span class="material-symbols-outlined text-[16px]">photo_camera</span></span>
          </button>
<div>
<div class="flex items-center gap-2">
<span class="font-headline-md text-headline-md text-on-surface">Antojitos</span>
<span class="px-2 py-0.5 rounded-full bg-surface-container-low text-primary font-label-sm text-label-sm border border-outline-variant">
                Comida Colombiana
              </span>
</div>
<p class="font-label-sm text-label-sm text-on-surface-variant">Operaciones WhatsApp</p>
</div>
</div>
</div>
<!-- Right Action Cluster -->
<div class="flex items-center gap-3">
<!-- Live Bot indicator badge in navbar -->
<div class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-low border border-outline-variant">
<span id="headerBotDot" class="w-2.5 h-2.5 rounded-full bg-tertiary-container animate-pulse"></span>
<span id="headerBotText" class="font-label-md text-label-md text-on-surface-variant">Estado Bot: Sin consultar</span>
</div>
<!-- Acceso Privado Trigger Modal/Popover Toggle -->
<button class="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-outline-variant text-on-surface bg-surface-container-lowest hover:bg-surface-container-low active:scale-[0.98] transition-transform transition-colors font-label-md text-label-md shadow-sm" id="privateAccessBtn" onclick="togglePrivateAccessModal()">
<span class="material-symbols-outlined text-[18px]">lock</span>
<span>Acceso Privado</span>
</button>
<div class="relative" id="notificationsContainer"><button aria-label="Notificaciones" id="notificationBellBtn" onclick="toggleNotificationsMenu()" class="relative p-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"><span class="material-symbols-outlined text-[20px]">notifications</span><span id="notifBadge" class="hidden absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary-container text-on-primary font-bold text-[10px] shadow-xs"></span></button>
<div id="notificationsDropdown" class="hidden absolute right-0 mt-2 w-[370px] max-w-[92vw] rounded-xl bg-surface-container-lowest border border-outline-variant shadow-lg z-50 overflow-hidden"><div class="p-3.5 border-b border-outline-variant flex items-center justify-between bg-surface-container-low/50"><div class="flex items-center gap-2"><h3 class="font-title-md text-title-md text-on-surface font-semibold">Notificaciones</h3><span id="notifCountBadge" class="px-2 py-0.5 rounded-full bg-secondary-container text-primary font-label-sm text-label-sm font-semibold">Al día</span></div><button onclick="markAllNotificationsRead()" class="text-label-sm font-label-sm text-primary hover:underline transition-all">Marcar todas leídas</button></div><div id="notifViewLoading" class="hidden py-10 px-4 flex flex-col items-center justify-center text-center gap-3"><div class="w-7 h-7 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></div><p class="font-body-sm text-body-sm text-on-surface-variant">Sincronizando notificaciones...</p></div><div id="notifViewError" class="hidden py-8 px-6 flex flex-col items-center justify-center text-center gap-3"><span class="material-symbols-outlined text-[30px] text-error">cloud_off</span><p class="font-body-sm text-body-sm text-on-surface-variant">No se pudieron cargar las notificaciones.</p><button onclick="loadNotifications()" class="px-3 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant font-label-md text-label-md text-on-surface">Reintentar</button></div><div id="notifViewEmpty" class="hidden py-10 px-6 flex flex-col items-center justify-center text-center gap-2"><span class="material-symbols-outlined text-[30px] text-primary">notifications_off</span><p class="font-title-md text-title-md font-semibold text-on-surface">No hay notificaciones nuevas</p><p class="font-body-sm text-body-sm text-on-surface-variant">Te avisaremos cuando entre un nuevo pedido por WhatsApp.</p></div><div id="notifViewList" class="max-h-[350px] overflow-y-auto divide-y divide-outline-variant/60"></div></div></div>
</div>
</div>
</header>
<!-- ACCESO PRIVADO MODAL / DIALOG (Accessible via Top Right Button) -->
<div id="changeLogoModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/30 backdrop-blur-xs hidden" role="dialog" aria-modal="true" aria-labelledby="logoModalTitle">
<div class="bg-surface-container-lowest w-full max-w-md rounded-xl p-6 border border-outline-variant shadow-lg animate-in fade-in zoom-in-95 duration-150">
<div class="flex justify-between items-center mb-4"><div class="flex items-center gap-2"><span class="material-symbols-outlined text-primary text-[22px]">image</span><h2 class="font-title-md text-title-md text-on-surface font-bold" id="logoModalTitle">Cambiar logo del restaurante</h2></div><button type="button" onclick="closeLogoModal()" class="text-on-surface-variant hover:text-on-surface p-1 rounded-lg transition-colors"><span class="material-symbols-outlined text-[20px]">close</span></button></div>
<div class="flex items-center gap-4 mb-4 p-3 rounded-xl bg-surface-container-low border border-outline-variant/60"><div id="modalLogoPreviewWrapper" class="w-20 h-20 rounded-xl bg-secondary-container flex items-center justify-center text-[36px] text-primary shrink-0 border border-outline-variant"><span id="modalLogoPreview">🥟</span></div><div class="flex-1"><div class="font-label-md text-label-md text-on-surface font-semibold mb-1">Vista previa actual</div><label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface font-label-md text-label-md hover:bg-surface-container cursor-pointer transition-colors shadow-xs active:scale-[0.98]"><span class="material-symbols-outlined text-[16px] text-primary">upload_file</span><span>Elegir imagen</span><input id="logoFileInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange="handleLogoFileSelect(event)"/></label><div class="mt-2 text-label-sm font-label-sm text-on-surface-variant"><span id="selectedFileName">Ningún archivo nuevo seleccionado</span></div></div></div>
<div class="mb-4 p-3 rounded-lg bg-surface-container border border-outline-variant/60 text-label-sm font-label-sm text-on-surface-variant space-y-1"><div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-primary">check_circle</span><span>Formatos permitidos: PNG, JPG, WebP.</span></div><div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-primary">straighten</span><span>Tamaño máximo: 1 MB.</span></div></div>
<div id="logoModalAlert" class="hidden mb-4 p-3 rounded-lg text-label-sm font-label-sm flex items-center gap-2"></div><div class="flex gap-2 pt-1 border-t border-outline-variant/60"><button type="button" onclick="closeLogoModal()" class="w-1/2 py-2.5 rounded-lg border border-outline-variant text-on-surface font-label-lg text-label-lg hover:bg-surface-container-low transition-colors">Cancelar</button><button id="saveLogoBtn" type="button" onclick="saveRestaurantLogo()" class="w-1/2 py-2.5 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2"><span id="saveLogoSpinner" class="material-symbols-outlined text-[18px] animate-spin hidden">progress_activity</span><span id="saveLogoBtnText">Guardar cambios</span></button></div>
</div></div>
<div aria-labelledby="modalTitle" aria-modal="true" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/30 backdrop-blur-xs hidden" id="privateAccessModal" role="dialog">
<div class="bg-surface-container-lowest w-full max-w-sm rounded-xl p-6 border border-outline-variant shadow-lg animate-in fade-in zoom-in-95 duration-150">
<div class="flex justify-between items-center mb-4">
<div class="flex items-center gap-2">
<span class="material-symbols-outlined text-primary text-[20px]">lock</span>
<h2 class="font-title-md text-title-md text-on-surface" id="modalTitle">Acceso privado</h2>
</div>
<button class="text-on-surface-variant hover:text-on-surface p-1 rounded-lg" onclick="togglePrivateAccessModal()">
<span class="material-symbols-outlined text-[20px]">close</span>
</button>
</div>
<p class="font-body-sm text-body-sm text-on-surface-variant mb-4">
        Ingresa tus credenciales de administrador para gestionar llaves y configuración.
      </p>
<form class="space-y-4" onsubmit="handlePrivateAuth(event)">
<div>
<label class="block font-label-md text-label-md text-on-surface mb-1" for="authPhone">Teléfono autorizado</label>
<div class="relative">
<span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-on-surface-variant">
<span class="material-symbols-outlined text-[18px]">phone</span>
</span>
<input class="w-full pl-9 pr-3 py-2 text-body-md font-body-md rounded-lg border border-outline-variant bg-surface-container-lowest focus:border-primary-container focus:ring-2 focus:ring-secondary-container focus:outline-none" id="authPhone" required="" type="text" placeholder="+57 300 000 0000"/>
</div>
</div>
<div>
<label class="block font-label-md text-label-md text-on-surface mb-1" for="authToken">Token administrativo</label>
<div class="relative">
<span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-on-surface-variant">
<span class="material-symbols-outlined text-[18px]">key</span>
</span>
<input class="w-full pl-9 pr-3 py-2 text-body-md font-body-md rounded-lg border border-outline-variant bg-surface-container-lowest focus:border-primary-container focus:ring-2 focus:ring-secondary-container focus:outline-none" id="authToken" placeholder="••••••••" required="" type="password" autocomplete="current-password"/>
</div>
</div>
<div class="pt-2 flex gap-2">
<button class="w-1/2 py-2.5 rounded-lg border border-outline-variant text-on-surface font-label-lg text-label-lg hover:bg-surface-container-low transition-colors" onclick="togglePrivateAccessModal()" type="button">
            Cancelar
          </button>
<button class="w-1/2 py-2.5 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg hover:opacity-95 active:scale-[0.98] transition-transform transition-opacity" type="submit">
            Entrar
          </button>
</div>
</form>
</div>
</div>
<!-- MAIN VIEWPORT CONTAINER -->
<main class="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 space-y-6">
<!-- 1. PAGE TITLE & REASSURING STATEMENT -->
<div class="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-outline-variant/60">
<div>
<div class="flex items-center gap-3">
<h1 class="font-headline-xl text-headline-xl text-on-surface tracking-tight">Centro de control</h1>
<span id="dateLabel" class="px-3 py-1 rounded-full bg-secondary-container text-primary font-label-md text-label-md">
            Hoy
          </span>
</div>
<p class="font-body-md text-body-md text-on-surface-variant mt-1 max-w-3xl">
          Tu asistente de WhatsApp está atendiendo clientes y tomando pedidos en tiempo real.
        </p>
</div>
<!-- Quick Service Action -->
<div class="flex items-center gap-2">
<button class="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface font-label-md text-label-md hover:bg-surface-container-low active:scale-[0.99] transition-all" id="mainToggleBtn" onclick="toggleGlobalBot()">
<span class="material-symbols-outlined text-[18px] text-tertiary">pause_circle</span>
<span id="mainToggleText">Pausar Servicio</span>
</button>
</div>
</div>
<!-- 2. PROMINENT OVERALL STATUS BANNER / CARD -->
<div class="bg-surface-container-lowest rounded-xl p-5 md:p-6 border border-outline-variant flex flex-col md:flex-row md:items-center justify-between gap-5">
<div class="flex items-start md:items-center gap-4">
<div class="w-12 h-12 rounded-xl bg-secondary-container flex items-center justify-center text-primary shrink-0">
<span class="material-symbols-outlined text-[28px]">smart_toy</span>
</div>
<div>
<div class="flex items-center gap-3">
<span id="statusTitle" class="font-title-lg text-title-lg text-on-surface font-bold">Estado no consultado</span>
<span id="statusPill" class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant border border-outline-variant/80 font-label-sm text-label-sm">
<span class="w-2 h-2 rounded-full bg-tertiary-container animate-ping"></span>
              Sin consultar
            </span>
</div>
<p id="statusText" class="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Recibiendo mensajes y registrando pedidos automáticamente en la línea oficial de WhatsApp.
          </p>
</div>
</div>
<!-- Segmented Status Indicators -->
<div class="flex items-center gap-1.5 p-1 rounded-xl bg-surface-container border border-outline-variant shrink-0 self-start md:self-auto">
<button id="segBtnActive" class="px-3.5 py-1.5 rounded-lg bg-surface-container-lowest font-label-md text-label-md text-primary shadow-xs border border-outline-variant/60 flex items-center gap-1.5 transition-all">
<span class="w-2 h-2 rounded-full bg-tertiary-container"></span>
          Bot activo
        </button>
<button id="segBtnOffHours" class="px-3.5 py-1.5 rounded-lg font-label-md text-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest/50 transition-colors">
          Fuera de horario
        </button>
<button id="segBtnPaused" class="px-3.5 py-1.5 rounded-lg font-label-md text-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest/50 transition-colors">
          Pausado
        </button>
</div>
</div>
<!-- 3. FOUR SUMMARY METRICS CARDS -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
<!-- Card 1 -->
<div class="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant flex flex-col justify-between">
<div class="flex justify-between items-start">
<span class="font-label-md text-label-md text-on-surface-variant">Pedidos de hoy</span>
<div class="w-9 h-9 rounded-lg bg-secondary-container flex items-center justify-center text-primary">
<span class="material-symbols-outlined text-[20px]">receipt_long</span>
</div>
</div>
<div class="mt-3">
<div id="todayOrdersMetric" class="font-headline-lg text-headline-lg text-on-surface font-bold">—</div>
<div class="flex items-center gap-1 text-tertiary font-label-sm text-label-sm mt-1">
<span class="material-symbols-outlined text-[16px]">trending_up</span>
<span id="lastHourOrdersMetric">— en la última hora</span>
</div>
</div>
</div>
<!-- Card 2 -->
<div class="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant flex flex-col justify-between">
<div class="flex justify-between items-start">
<span class="font-label-md text-label-md text-on-surface-variant">Pendientes de atención</span>
<div class="w-9 h-9 rounded-lg bg-secondary-container flex items-center justify-center text-primary">
<span class="material-symbols-outlined text-[20px]">restaurant</span>
</div>
</div>
<div class="mt-3">
<div id="attentionOrdersMetric" class="font-headline-lg text-headline-lg text-on-surface font-bold">—</div>
<div class="text-on-surface-variant font-label-sm text-label-sm mt-1">
            Esperando confirmación de cocina
          </div>
</div>
</div>
<!-- Card 3 -->
<div class="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant flex flex-col justify-between">
<div class="flex justify-between items-start">
<span class="font-label-md text-label-md text-on-surface-variant">Horario</span>
<div class="w-9 h-9 rounded-lg bg-secondary-container flex items-center justify-center text-primary">
<span class="material-symbols-outlined text-[20px]">schedule</span>
</div>
</div>
<div class="mt-3">
<div id="scheduleMetric" class="font-headline-lg text-headline-lg text-on-surface-variant font-bold">—</div>
<div class="text-on-surface-variant font-label-sm text-label-sm mt-1">
            11:30 AM - 10:00 PM
          </div>
</div>
</div>
<!-- Card 4 -->
<div class="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant flex flex-col justify-between">
<div class="flex justify-between items-start">
<span class="font-label-md text-label-md text-on-surface-variant">Pausa humana</span>
<div class="w-9 h-9 rounded-lg bg-secondary-container flex items-center justify-center text-primary">
<span class="material-symbols-outlined text-[20px]">person</span>
</div>
</div>
<div class="mt-3">
<div id="activeHumanPausesMetric" class="font-headline-lg text-headline-lg text-on-surface font-bold">—</div>
<div class="text-on-surface-variant font-label-sm text-label-sm mt-1">
            5 min por chat individual
          </div>
</div>
</div>
</div>
<!-- 4. TWO-COLUMN MAIN CONTENT LAYOUT (60% / 40%) -->
<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
<!-- LEFT COLUMN: PEDIDOS RECIBIDOS POR WHATSAPP (60% -> 7 Cols) -->
<section class="lg:col-span-7 bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden">
<div class="p-5 border-b border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-lowest">
<div class="flex items-center gap-2.5">
<span class="material-symbols-outlined text-primary text-[22px]">chat</span>
<div>
<h2 class="font-title-lg text-title-lg text-on-surface font-bold">Pedidos recibidos por WhatsApp</h2>
<p class="font-label-sm text-label-sm text-on-surface-variant">Actualizado al instante desde los chats de clientes</p>
</div>
</div>
<span class="px-2.5 py-1 rounded-md bg-secondary-container text-primary font-label-sm text-label-sm self-start sm:self-auto font-semibold">
            5 recientes
          </span>
</div>
<!-- Orders List / Table Container -->
<div id="ordersContainer" class="divide-y divide-outline-variant/70 overflow-x-auto"><div class="p-6 text-center text-on-surface-variant">Inicia sesión para cargar los pedidos.</div></div>
</section>
<!-- RIGHT COLUMN: ENTORNO DEL BOT (40% -> 5 Cols) -->
<aside class="lg:col-span-5 space-y-6">
<!-- SECTION TITLE HEADER -->
<div class="flex items-center gap-2">
<span class="material-symbols-outlined text-primary text-[22px]">tune</span>
<h2 class="font-title-lg text-title-lg text-on-surface font-bold">Entorno del bot</h2>
</div>
<!-- BOX 1: BOT OPERATIONAL STATE (PRIMARY TOGGLE) -->
<div class="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant shadow-xs">
<div class="flex items-center justify-between mb-3">
<h3 class="font-title-md text-title-md text-on-surface font-semibold">Estado de operación</h3>
<span class="w-2.5 h-2.5 rounded-full bg-tertiary-container animate-pulse"></span>
</div>
<p class="font-body-sm text-body-sm text-on-surface-variant mb-4">
            Determina si el motor conversacional interactúa de manera inmediata con los mensajes entrantes.
          </p>
<div class="grid grid-cols-2 gap-3">
<button class="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-secondary-container text-primary border border-outline-variant font-label-lg text-label-lg font-bold shadow-xs transition-all active:scale-[0.98]" id="btnStateActive" onclick="setBotStatus(true)">
<span class="w-2.5 h-2.5 rounded-full bg-tertiary-container"></span>
              Bot activo
            </button>
<button class="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-low font-label-lg text-label-lg transition-all active:scale-[0.98]" id="btnStatePaused" onclick="setBotStatus(false)">
<span class="material-symbols-outlined text-[18px]">pause</span>
              Bot pausado
            </button>
</div>
</div>
<!-- BOX 2: HORARIO DE HOY -->
<div class="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant shadow-xs">
<div class="flex items-center justify-between mb-2">
<h3 class="font-title-md text-title-md text-on-surface font-semibold">Horario de hoy</h3>
<span id="schedulePill" class="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-label-sm font-label-sm font-semibold border border-outline-variant">
              Sin consultar
            </span>
</div>
<p class="font-body-sm text-body-sm text-on-surface-variant mb-4">
            Controla si el bot recibe pedidos de inmediato o responde con mensaje de cerrado.
          </p>
<div class="grid grid-cols-2 gap-3">
<button class="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg hover:opacity-95 active:scale-[0.98] transition-transform" id="btnScheduleOpen" onclick="setSchedule(true)">
<span class="material-symbols-outlined text-[18px]">door_open</span>
              Abrir hoy
            </button>
<button class="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant hover:bg-surface-container-low font-label-lg text-label-lg active:scale-[0.98] transition-colors" id="btnScheduleClose" onclick="setSchedule(false)">
<span class="material-symbols-outlined text-[18px]">door_front</span>
              Cerrar hoy
            </button>
</div>
</div>
<!-- BOX 3: INTERVENCIÓN HUMANA -->
<div class="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant shadow-xs">
<div class="flex items-center gap-2 mb-2">
<h3 class="font-title-md text-title-md text-on-surface font-semibold">Intervención humana</h3>
</div>
<p class="font-body-sm text-body-sm text-on-surface-variant mb-4">
            La intervención humana pausa únicamente esa conversación para que puedas responder tú mismo sin que el bot interfiera.
          </p>
<div class="space-y-3">
<div>
<label class="block font-label-md text-label-md text-on-surface mb-1" for="customerPhoneInput">
                Número de WhatsApp del cliente
              </label>
<div class="relative">
<span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-on-surface-variant">
<span class="material-symbols-outlined text-[18px]">phone_iphone</span>
</span>
<input class="w-full pl-9 pr-3 py-2.5 text-body-md font-body-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface placeholder-on-surface-variant/50 focus:border-primary-container focus:ring-2 focus:ring-secondary-container focus:outline-none transition-all" id="customerPhoneInput" placeholder="+57 300 000 0000" type="text"/>
</div>
</div>
<div class="grid grid-cols-2 gap-3 pt-1">
<button class="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-secondary-container text-primary font-label-md text-label-md hover:bg-secondary-fixed active:scale-[0.98] transition-transform" onclick="pauseChatForMinutes(5)">
<span class="material-symbols-outlined text-[16px]">timer</span>
                Pausar 5 minutos
              </button>
<button class="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant hover:bg-surface-container-low font-label-md text-label-md active:scale-[0.98] transition-colors" onclick="resumeChat()">
<span class="material-symbols-outlined text-[16px]">play_arrow</span>
                Reanudar bot
              </button>
</div>
<div class="hidden p-3 rounded-lg bg-surface-container border border-outline-variant text-body-sm font-body-sm text-primary flex items-center gap-2" id="interventionAlert">
<span class="material-symbols-outlined text-[18px]">info</span>
<span id="interventionAlertText">Conversación pausada por 5 minutos.</span>
</div>
</div>
</div>
</aside>
</div>
</main>
<!-- FOOTER -->
<footer class="mt-auto border-t border-outline-variant/60 py-4 px-6 bg-surface-container-lowest text-on-surface-variant text-label-sm font-label-sm">
<div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
<div>Antojitos • Panel de control para WhatsApp Business</div>
<div class="flex items-center gap-4">
<span id="serverConnection">Conexión de servidor: Sin consultar</span>
<span id="lastSync">Última sincronización: —</span>
</div>
</div>
</footer>
<!-- SCRIPT FOR UI INTERACTIONS -->
<script>
let authenticated=false,requestBusy=false,pauseTimer=null;
const $=id=>document.getElementById(id);
const token=()=>($('authToken')?.value||'').trim();
const adminPhone=()=>($('authPhone')?.value||'').trim();
const authHeaders=()=>({Authorization:'Bearer '+token(),'X-Admin-Phone':adminPhone(),'Content-Type':'application/json'});
function toast(message,type='success'){const el=document.createElement('div');el.className='fixed top-5 right-5 z-[70] max-w-sm px-4 py-3 rounded-lg shadow-lg text-body-sm '+(type==='error'?'bg-error-container text-on-error-container':type==='warn'?'bg-secondary-container text-primary':'bg-tertiary-container text-on-tertiary');el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),3500)}
function setControlAccess(value){authenticated=value;['mainToggleBtn','btnStateActive','btnStatePaused','btnScheduleOpen','btnScheduleClose','customerPhoneInput','pauseDuration'].forEach(id=>{const el=$(id);if(el)el.disabled=!value})}
function togglePrivateAccessModal(){const modal=$('privateAccessModal');modal.classList.toggle('hidden');modal.classList.toggle('flex');$('authError')?.classList.add('hidden')}
function setAuthBusy(value){const button=document.querySelector('#privateAccessModal button[type="submit"]');if(!button)return;button.disabled=value;button.innerHTML=value?'⏳ Verificando…':'Entrar'}
let pendingLogoDataUrl=null;
function setLogoNode(container,dataUrl){if(!container)return;container.replaceChildren();if(dataUrl){const image=document.createElement('img');image.className='w-full h-full object-cover rounded-xl';image.alt='Vista previa del logo';image.src=dataUrl;container.append(image)}else container.textContent='🥟'}
function applyLogoPreview(dataUrl){const image=$('brandLogo'),fallback=$('brandFallback'),modal=$('modalLogoPreview'),wrapper=$('modalLogoPreviewWrapper');if(dataUrl){if(image){image.src=dataUrl;image.classList.remove('hidden')}if(fallback)fallback.classList.add('hidden');setLogoNode(modal,dataUrl)}else{if(image){image.removeAttribute('src');image.classList.add('hidden')}if(fallback)fallback.classList.remove('hidden');setLogoNode(modal,null)}if(wrapper)wrapper.classList.remove('text-[36px]')}
async function loadBranding(){if(!authenticated)return;const data=await api('/api/admin/branding');if(data?.logoDataUrl)applyLogoPreview(data.logoDataUrl)}
function openLogoModal(){if(!authenticated){togglePrivateAccessModal();toast('Inicia sesión para cambiar el logo.','warn');return}pendingLogoDataUrl=null;const input=$('logoFileInput');if(input)input.value='';const name=$('selectedFileName');if(name)name.textContent='Ningún archivo nuevo seleccionado';const alert=$('logoModalAlert');if(alert)alert.className='hidden mb-4 p-3 rounded-lg text-label-sm font-label-sm flex items-center gap-2';const current=$('brandLogo')?.src;setLogoNode($('modalLogoPreview'),current||null);$('changeLogoModal').classList.remove('hidden');$('changeLogoModal').classList.add('flex')}
function closeLogoModal(){$('changeLogoModal').classList.add('hidden');$('changeLogoModal').classList.remove('flex');pendingLogoDataUrl=null}
function showLogoAlert(message,type='error'){const alert=$('logoModalAlert');if(!alert)return;alert.className='mb-4 p-3 rounded-lg text-label-sm font-label-sm flex items-center gap-2 '+(type==='success'?'bg-tertiary-container text-on-tertiary':'bg-error-container text-on-error-container');alert.textContent=message}
function handleLogoFileSelect(event){const file=event.target.files?.[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1024*1024){pendingLogoDataUrl=null;showLogoAlert('Elige un PNG, JPG o WebP de máximo 1 MB.');event.target.value='';return}const reader=new FileReader();reader.onload=()=>{pendingLogoDataUrl=String(reader.result);setLogoNode($('modalLogoPreview'),pendingLogoDataUrl);const name=$('selectedFileName');if(name)name.textContent=file.name;const alert=$('logoModalAlert');if(alert)alert.className='hidden mb-4 p-3 rounded-lg text-label-sm font-label-sm flex items-center gap-2'};reader.readAsDataURL(file)}
async function saveRestaurantLogo(){if(!pendingLogoDataUrl){showLogoAlert('Selecciona una imagen antes de guardar.','error');return}const button=$('saveLogoBtn'),spinner=$('saveLogoSpinner'),label=$('saveLogoBtnText');if(button)button.disabled=true;if(spinner)spinner.classList.remove('hidden');if(label)label.textContent='Guardando…';const data=await api('/api/admin/branding/logo',{logoDataUrl:pendingLogoDataUrl},'PUT');if(button)button.disabled=false;if(spinner)spinner.classList.add('hidden');if(label)label.textContent='Guardar cambios';if(data?.logoDataUrl){applyLogoPreview(data.logoDataUrl);showLogoAlert('Logo actualizado correctamente.','success');toast('✓ Logo actualizado');setTimeout(closeLogoModal,700)}}
async function api(path,body,method){if(!token()||!adminPhone()){toast('Completa el teléfono autorizado y el token.','error');return null}if(requestBusy)return null;requestBusy=true;try{const response=await fetch(path,{method:method||(body?'POST':'GET'),headers:authHeaders(),body:body?JSON.stringify(body):undefined}),data=await response.json();if(response.status===401){setControlAccess(false);$('authError')?.classList.remove('hidden');toast('Teléfono no autorizado o token inválido.','error');return null}if(!response.ok){toast(data.error||'No se pudo completar la operación.','error');return null}return data}catch{toast('No se pudo conectar con el servidor.','error');return null}finally{requestBusy=false}}
async function handlePrivateAuth(event){event.preventDefault();$('authError')?.classList.add('hidden');setAuthBusy(true);const data=await api('/api/admin/status');setAuthBusy(false);if(data){setControlAccess(true);togglePrivateAccessModal();toast('✓ Acceso concedido · Controles habilitados');renderStatus(data);syncStatusExtras(data);loadBranding();loadOrders();loadNotifications();notificationTimer=notificationTimer||setInterval(loadNotifications,15000)}}
async function refreshStatus(){const data=await api('/api/admin/status');if(data){renderStatus(data);syncStatusExtras(data)}}
function syncStatusExtras(data){const schedulePill=$('schedulePill'),date=$('dateLabel'),connection=$('serverConnection'),sync=$('lastSync');const open=Boolean(data.schedule?.open??data.schedule?.isOpen);if(schedulePill){schedulePill.textContent=open?'Abierto':'Cerrado';schedulePill.className='px-2.5 py-0.5 rounded-full text-label-sm font-label-sm font-semibold border border-outline-variant '+(open?'bg-surface-container text-tertiary':'bg-secondary-container text-primary')}if(date)date.textContent='Hoy · '+new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});if(connection)connection.textContent='Conexión de servidor: Activa';if(sync)sync.textContent='Última sincronización: '+new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}
function renderStatus(data){const open=Boolean(data.schedule?.open??data.schedule?.isOpen),kind=data.state?.kind||(open?'active':'off_hours'),active=kind==='active';const title=$('statusTitle');if(title)title.textContent=active?'Bot activo':'Fuera de horario';const text=$('statusText');if(text)text.textContent=active?'Recibiendo mensajes y registrando pedidos automáticamente.':'El bot está cerrado temporalmente y no procesará nuevos mensajes.';const headerText=$('headerBotText'),headerDot=$('headerBotDot');if(headerText)headerText.textContent=active?'Estado Bot: Activo':'Estado Bot: Fuera de horario';if(headerDot)headerDot.className='w-2.5 h-2.5 rounded-full '+(active?'bg-tertiary-container animate-pulse':'bg-amber-500');const pill=document.querySelector('#statusPill');if(pill){pill.innerHTML='<span class="w-2.5 h-2.5 rounded-full '+(active?'bg-tertiary-container':'bg-amber-500')+'"></span>'+(active?'Activo':'Fuera de horario');pill.className='inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full '+(active?'bg-surface-container text-tertiary':'bg-secondary-container text-primary')+' border border-outline-variant/80 font-label-sm text-label-sm'}const metric=$('scheduleMetric');if(metric)metric.textContent=active?'Abierto':'Cerrado';const today=$('todayOrdersMetric'),attention=$('attentionOrdersMetric'),lastHour=$('lastHourOrdersMetric'),pauses=$('activeHumanPausesMetric'),dashboard=data.dashboard||{};if(today)today.textContent=String(dashboard.todayOrders??0)+' pedidos';if(attention)attention.textContent=String(dashboard.attentionOrders??0)+' pedidos';if(lastHour)lastHour.textContent='+'+String(dashboard.lastHourOrders??0)+' en la última hora';if(pauses)pauses.textContent=String(dashboard.activeHumanPauses??0)+' activas';const activeBtn=$('btnStateActive'),pausedBtn=$('btnStatePaused');if(activeBtn)activeBtn.className=active?'flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-secondary-container text-primary border border-outline-variant font-label-lg text-label-lg font-bold shadow-xs transition-all active:scale-[0.98]':'flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-low font-label-lg text-label-lg transition-all active:scale-[0.98]';if(pausedBtn)pausedBtn.className=active?'flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-low font-label-lg text-label-lg transition-all active:scale-[0.98]':'flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-secondary-container text-primary border border-outline-variant font-label-lg text-label-lg font-bold shadow-xs transition-all active:scale-[0.98]';const activeSegment=$('segBtnActive'),offSegment=$('segBtnOffHours'),pausedSegment=$('segBtnPaused');[activeSegment,offSegment,pausedSegment].forEach((button,index)=>{if(button)button.className=(index===(active?0:1)?'px-3.5 py-1.5 rounded-lg bg-surface-container-lowest font-label-md text-label-md text-primary shadow-xs border border-outline-variant/60 flex items-center gap-1.5 transition-all':'px-3.5 py-1.5 rounded-lg font-label-md text-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest/50 transition-colors')});setScheduleVisual(open)}
function setScheduleVisual(open){const openBtn=$('btnScheduleOpen'),closeBtn=$('btnScheduleClose');if(!openBtn||!closeBtn)return;openBtn.className=open?'flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg':'flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant font-label-lg text-label-lg';closeBtn.className=open?'flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant font-label-lg text-label-lg':'flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg'}
function setBotStatus(active){setSchedule(active)}
function toggleGlobalBot(){if(!authenticated){togglePrivateAccessModal();return}setSchedule(!$('mainToggleText')?.textContent?.includes('Reanudar'))}
function closeServicePause(){}
async function confirmGlobalPause(){await setSchedule(false)}
async function setSchedule(open){if(!authenticated){togglePrivateAccessModal();return}const button=open?$('btnScheduleOpen'):$('btnScheduleClose');const old=button.innerHTML;button.disabled=true;button.innerHTML='⏳ Guardando…';const data=await api('/api/admin/command',{command:open?'!horario on':'!horario off'});button.innerHTML=old;button.disabled=false;if(data){setScheduleVisual(open);if($('mainToggleText'))$('mainToggleText').textContent=open?'Pausar Servicio':'Reanudar Servicio';toast('✓ Horario actualizado: '+(open?'Abierto':'Cerrado'));renderStatus(data);syncStatusExtras(data)}}
function setPauseDuration(value){if(value==='custom'){$('customPauseWrap').classList.remove('hidden');return}$('customPauseWrap').classList.add('hidden');$('pauseDurationHint').textContent='Pausa por conversación · '+value+' minutos';toast('Duración fijada en '+value+' minutos')}
function selectedPauseMinutes(){const select=$('pauseDuration');if(!select)return null;const value=select.value;const custom=value==='custom'?Number($('customPause')?.value):Number(value);return Number.isInteger(custom)&&custom>=1&&custom<=1440?custom:null}
function validPhone(value){return value.replace(/[^0-9]/g,'').length>=7}
async function pauseChatForMinutes(requestedMinutes=5){if(!authenticated){togglePrivateAccessModal();return}const input=$('customerPhoneInput'),raw=input.value.trim();if(!validPhone(raw)){toast('Ingresa un número de WhatsApp válido.','error');input.focus();return}const minutes=selectedPauseMinutes()||Number(requestedMinutes)||5;if(!Number.isInteger(minutes)||minutes<1||minutes>1440){toast('Define una duración entre 1 y 1440 minutos.','error');return}const data=await api('/api/admin/command',{command:'!bot off',phoneNumber:raw,pauseMinutes:minutes});if(data){showIntervention(data.pauseUntil,raw);toast('✓ Pausa activa para '+raw+' · '+minutes+' min');await refreshStatus()}}
function showIntervention(until,raw){const alertBox=$('interventionAlert'),text=$('interventionAlertText');alertBox.classList.remove('hidden');const end=new Date(until).getTime();const tick=()=>{const remaining=Math.max(0,end-Date.now()),seconds=Math.ceil(remaining/1000),m=Math.floor(seconds/60),s=String(seconds%60).padStart(2,'0');text.textContent='✓ Pausa activa para '+raw+' · '+m+':'+s+' restantes';if(remaining<=0){clearInterval(pauseTimer);text.textContent='La pausa terminó. El bot puede responder nuevamente.'}};clearInterval(pauseTimer);tick();pauseTimer=setInterval(tick,1000)}
async function resumeChat(){if(!authenticated){togglePrivateAccessModal();return}const raw=$('customerPhoneInput').value.trim();if(!validPhone(raw)){toast('Ingresa un número de WhatsApp válido.','error');return}const data=await api('/api/admin/command',{command:'!bot on',phoneNumber:raw});if(data){$('interventionAlert').classList.add('hidden');clearInterval(pauseTimer);toast('✓ Bot reanudado para '+raw);await refreshStatus()}}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
let nextOrderCursor=null;
function renderOrders(orders,append){const box=$('ordersContainer');if(!append)box.innerHTML='';const html=orders.map(order=>'<article class="p-5 hover:bg-surface-container-low transition-colors"><div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2"><div class="flex items-center gap-2"><span class="font-label-lg text-label-lg font-bold text-primary">#'+esc(order.id)+'</span><span class="font-label-sm text-label-sm text-on-surface-variant">'+esc(new Date(order.createdAt).toLocaleString('es-CO'))+'</span></div><span class="px-2.5 py-1 rounded-full text-label-sm bg-surface-container text-primary border border-outline-variant">'+esc(order.paymentMethod||'Pendiente')+'</span></div><div class="mb-3"><div class="font-title-md text-title-md font-semibold">'+esc(order.customerName||'Cliente')+'</div><div class="text-on-surface-variant font-label-sm">'+esc(order.phoneNumber||'')+'</div></div><div class="p-2.5 rounded-lg bg-surface-container border border-outline-variant/60 font-body-sm mb-3.5"><span class="font-semibold text-primary">Items:</span> '+esc((Array.isArray(order.items)?order.items:[]).map(item=>(item.quantity||1)+'x '+(item.productName||'Producto')).join(' · ')||'Detalle no disponible')+'</div><div class="flex items-center justify-between gap-3"><span class="font-label-sm text-label-sm text-on-surface-variant">Estado del pedido:</span><select class="order-status appearance-none bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-1.5 text-label-sm" data-id="'+esc(order.id)+'" onchange="updateOrderStatus(this)"><option value="DRAFT">Nuevo</option><option value="PENDING_PAYMENT">Pago pendiente</option><option value="PAYMENT_VERIFIED">Pago verificado</option><option value="SENT_TO_KITCHEN">En preparación</option><option value="CANCELLED">Cancelado</option></select></div></article>').join('');box.insertAdjacentHTML('beforeend',html);orders.forEach(order=>{const select=document.querySelector('.order-status[data-id="'+CSS.escape(order.id)+'"]');if(select)select.value=order.status})}
async function loadOrders(cursor=null){if(!authenticated)return;const box=$('ordersContainer');try{const query=cursor?'?limit=20&cursor='+encodeURIComponent(cursor):'?limit=20';const response=await fetch('/api/admin/orders'+query,{headers:authHeaders()}),data=await response.json();if(!response.ok){toast(data.error||'No se pudieron cargar los pedidos.','error');return}if(!cursor&&!data.orders?.length){box.innerHTML='<div class="p-6 text-center text-on-surface-variant">No hay pedidos registrados todavía.</div>';return}renderOrders(data.orders||[],Boolean(cursor));nextOrderCursor=data.nextCursor||null;let more=$('loadMoreOrders');if(more)more.remove();if(nextOrderCursor){box.insertAdjacentHTML('afterend','<button id="loadMoreOrders" class="mt-4 w-full py-2.5 rounded-lg border border-outline-variant text-primary font-label-md hover:bg-surface-container-low" onclick="loadOrders(nextOrderCursor)">Cargar más pedidos</button>')}}catch{toast('No se pudo cargar la cola de pedidos.','error')}}
let notificationSince=sessionStorage.getItem('antojitos_admin_notification_since')||new Date(Date.now()-86400000).toISOString(),notificationTimer=null,notificationItems=[];
function toggleNotificationsMenu(){const menu=$('notificationsDropdown');if(!menu)return;menu.classList.toggle('hidden');if(!menu.classList.contains('hidden'))loadNotifications()}
function relativeNotificationTime(value){const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));if(seconds<60)return 'Hace unos segundos';const minutes=Math.floor(seconds/60);if(minutes<60)return 'Hace '+minutes+' min';const hours=Math.floor(minutes/60);return 'Hace '+hours+' h'}
function setNotificationView(view){['Loading','Error','Empty','List'].forEach(name=>{$('notifView'+name)?.classList.toggle('hidden',name.toLowerCase()!==view)});}
function renderNotifications(items){const list=$('notifViewList');if(!list)return;if(!items.length){list.innerHTML='';setNotificationView('empty');return}setNotificationView('list');list.innerHTML=items.map(item=>'<article class="p-3.5 '+(item.readAt?'opacity-60':'bg-surface-container-low/40')+' hover:bg-surface-container-low transition-colors relative flex items-start gap-3" data-notification-id="'+esc(item.id)+'"><div class="w-2 h-2 rounded-full '+(item.readAt?'hidden ':'')+'bg-primary-container mt-2 shrink-0"></div><div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-1"><span class="font-label-md text-label-md font-bold text-primary">'+esc(item.resourceId||'Pedido')+'</span><span class="text-[11px] text-on-surface-variant font-medium">'+relativeNotificationTime(item.createdAt)+'</span></div><p class="font-body-sm text-body-sm font-semibold text-on-surface mt-0.5 truncate">'+esc(item.title)+'</p><p class="text-[12px] text-on-surface-variant">'+esc(item.body)+'</p><div class="flex items-center gap-3 mt-2"><button data-notification-order="'+esc(item.resourceId||'')+'" class="font-label-sm text-label-sm text-primary font-semibold hover:underline">Ver pedido</button><button data-notification-read="'+esc(item.id)+'" class="font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface">'+(item.readAt?'Leída':'Marcar como leída')+'</button></div></div></article>').join('')}
async function loadNotifications(){if(!authenticated)return;setNotificationView('loading');try{const response=await fetch('/api/admin/notifications?limit=20&since='+encodeURIComponent(notificationSince),{headers:authHeaders()}),data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudieron cargar las notificaciones');const items=data.notifications||[];if(items.length){const latest=items[items.length-1].createdAt;notificationSince=latest;sessionStorage.setItem('antojitos_admin_notification_since',latest);const merged=new Map(notificationItems.map(item=>[item.id,item]));items.forEach(item=>merged.set(item.id,item));notificationItems=[...merged.values()].slice(-20);if(!document.hidden&&$('notificationsDropdown')?.classList.contains('hidden'))toast('Nuevo pedido recibido','success')}const badge=$('notifBadge'),count=$('notifCountBadge'),unread=Number(data.unreadCount||0);if(badge){badge.textContent=unread>99?'99+':String(unread);badge.classList.toggle('hidden',unread===0);badge.classList.toggle('flex',unread>0)}if(count)count.textContent=unread?unread+' nuevas':'Al día';renderNotifications(notificationItems)}catch(error){setNotificationView('error');if(error instanceof Error)console.warn(error.message)}}
async function markNotificationRead(id){const data=await api('/api/admin/notifications/'+encodeURIComponent(id)+'/read',{},'PATCH');if(data){const item=notificationItems.find(value=>value.id===id);if(item)item.readAt=new Date().toISOString();loadNotifications()}}
async function markAllNotificationsRead(){const data=await api('/api/admin/notifications/read-all',{},'POST');if(data){notificationItems.forEach(item=>item.readAt=new Date().toISOString());loadNotifications()}}
function viewNotificationOrder(orderId){const match=[...document.querySelectorAll('#ordersContainer article')].find(article=>article.textContent?.includes(orderId));if(match){match.scrollIntoView({behavior:'smooth',block:'center'});match.classList.add('ring-2','ring-primary-container');setTimeout(()=>match.classList.remove('ring-2','ring-primary-container'),2000)}$('notificationsDropdown')?.classList.add('hidden')}
async function updateOrderStatus(select){const response=await fetch('/api/admin/orders/'+encodeURIComponent(select.dataset.id)+'/status',{method:'PATCH',headers:authHeaders(),body:JSON.stringify({status:select.value})}),data=await response.json();if(response.ok)toast('✓ Pedido '+select.dataset.id+': estado actualizado');else toast(data.error||'No se pudo actualizar el pedido.','error')}
document.addEventListener('click',event=>{const target=event.target instanceof Element?event.target:null;const orderButton=target?.closest('[data-notification-order]');const readButton=target?.closest('[data-notification-read]');if(orderButton){viewNotificationOrder(orderButton.getAttribute('data-notification-order')||'');return}if(readButton){markNotificationRead(readButton.getAttribute('data-notification-read')||'');return}const container=$('notificationsContainer'),menu=$('notificationsDropdown');if(container&&menu&&!container.contains(event.target))menu.classList.add('hidden')});document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeServicePause();if(!$('changeLogoModal').classList.contains('hidden'))closeLogoModal();if(!$('privateAccessModal').classList.contains('hidden'))togglePrivateAccessModal();$('notificationsDropdown')?.classList.add('hidden')}});document.addEventListener('DOMContentLoaded',()=>{setControlAccess(false);if(token()&&adminPhone())api('/api/admin/status').then(data=>{if(data){setControlAccess(true);renderStatus(data);syncStatusExtras(data);loadBranding();loadOrders();loadNotifications();notificationTimer=notificationTimer||setInterval(loadNotifications,15000)}})});
  </script>
</body></html>

`;
}

