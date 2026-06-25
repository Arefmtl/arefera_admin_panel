/**
 * Panel API Worker — serves the admin panel API endpoints.
 * The frontend is served separately (or can be embedded as a static build).
 * This worker handles all /api/* routes using D1.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route API requests
      if (url.pathname.startsWith("/api/")) {
        return handleApi(request, env, url, corsHeaders);
      }

      // Health check
      if (url.pathname === "/health") {
        return json({ ok: true, service: "panel-api" }, corsHeaders);
      }

      // Login page (simple HTML form)
      if (url.pathname === "/login" || url.pathname === "/") {
        return getLoginHtml(corsHeaders);
      }

      // Dashboard (simple HTML)
      if (url.pathname === "/dashboard") {
        return getDashboardHtml(request, env, corsHeaders);
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (err) {
      return json({ error: err.message }, corsHeaders, 500);
    }
  },
};

// ─── API Router ──────────────────────────────────────────────────────────────
async function handleApi(request, env, url, corsHeaders) {
  const path = url.pathname;
  const method = request.method;

  // Auth
  if (path === "/api/auth/login" && method === "POST") {
    return handleLogin(request, env, corsHeaders);
  }
  if (path === "/api/auth/me" && method === "GET") {
    return handleAuthMe(request, env, corsHeaders);
  }

  // Dashboard
  if (path === "/api/dashboard" && method === "GET") {
    return handleDashboard(env, corsHeaders);
  }

  // Channels
  if (path === "/api/channels" && method === "GET") {
    return handleGetChannels(env, corsHeaders);
  }
  if (path === "/api/channels" && method === "POST") {
    return handleAddChannel(request, env, corsHeaders);
  }
  if (path.match(/^\/api\/channels\/\d+$/) && method === "DELETE") {
    const id = path.split("/").pop();
    return handleDeleteChannel(id, env, corsHeaders);
  }

  // Scheduled posts
  if (path === "/api/scheduled" && method === "GET") {
    return handleGetScheduled(env, corsHeaders);
  }
  if (path === "/api/scheduled" && method === "POST") {
    return handleAddScheduled(request, env, corsHeaders);
  }
  if (path.match(/^\/api\/scheduled\/.+\/cancel$/) && method === "POST") {
    const id = path.split("/")[3];
    return handleCancelScheduled(id, env, corsHeaders);
  }

  // Logs
  if (path === "/api/logs" && method === "GET") {
    return handleGetLogs(env, corsHeaders);
  }

  return json({ error: "Not found" }, corsHeaders, 404);
}

// ─── Auth ────────────────────────────────────────────────────────────────────
async function handleLogin(request, env, corsHeaders) {
  const { password } = await request.json();

  if (password !== "admin123") {
    return json({ error: "Invalid password" }, corsHeaders, 401);
  }

  // Create a simple session token
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO Session (id, createdAt, lastSeenAt, expiresAt, active) VALUES (?, ?, ?, ?, ?)")
    .bind(token, new Date().toISOString(), new Date().toISOString(), expiresAt, 1)
    .run();

  return json({ token, user: { id: 1, name: "Admin", role: "admin" } }, corsHeaders);
}

async function handleAuthMe(request, env, corsHeaders) {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, corsHeaders, 401);
  }
  const token = auth.slice(7);
  const session = await env.DB.prepare("SELECT * FROM Session WHERE id = ? AND expiresAt > ? AND active = ?")
    .bind(token, new Date().toISOString(), 1)
    .first();
  if (!session) {
    return json({ error: "Invalid session" }, corsHeaders, 401);
  }
  return json({ user: { id: 1, name: "Admin", role: "admin" } }, corsHeaders);
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
async function handleDashboard(env, corsHeaders) {
  const channels = await env.BOT_DB.get("channels").then(r => r ? JSON.parse(r) : []);
  const scheduled = await env.BOT_DB.get("scheduled_posts").then(r => r ? JSON.parse(r) : []);
  const admins = await env.BOT_DB.get("admins").then(r => r ? JSON.parse(r) : []);

  return json({
    channels: channels.length,
    scheduledPosts: scheduled.length,
    pendingPosts: scheduled.filter(p => !p.sent).length,
    admins: admins.length,
    recentPosts: scheduled.slice(-5).reverse(),
  }, corsHeaders);
}

// ─── Channels ────────────────────────────────────────────────────────────────
async function handleGetChannels(env, corsHeaders) {
  const channels = await env.BOT_DB.get("channels").then(r => r ? JSON.parse(r) : []);
  return json({ channels }, corsHeaders);
}

async function handleAddChannel(request, env, corsHeaders) {
  const { id, title } = await request.json();
  const channels = await env.BOT_DB.get("channels").then(r => r ? JSON.parse(r) : []);
  if (channels.some(c => String(c.id) === String(id))) {
    return json({ error: "Channel already exists" }, corsHeaders, 400);
  }
  channels.push({ id, title });
  await env.BOT_DB.put("channels", JSON.stringify(channels));
  return json({ ok: true, channels }, corsHeaders);
}

async function handleDeleteChannel(id, env, corsHeaders) {
  const channels = await env.BOT_DB.get("channels").then(r => r ? JSON.parse(r) : []);
  const filtered = channels.filter(c => String(c.id) !== String(id));
  await env.BOT_DB.put("channels", JSON.stringify(filtered));
  return json({ ok: true, channels: filtered }, corsHeaders);
}

// ─── Scheduled Posts ─────────────────────────────────────────────────────────
async function handleGetScheduled(env, corsHeaders) {
  const posts = await env.BOT_DB.get("scheduled_posts").then(r => r ? JSON.parse(r) : []);
  return json({ posts }, corsHeaders);
}

async function handleAddScheduled(request, env, corsHeaders) {
  const { prompt, channelIds, sendAt } = await request.json();
  const posts = await env.BOT_DB.get("scheduled_posts").then(r => r ? JSON.parse(r) : []);

  const post = {
    id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: 0,
    prompt,
    generatedText: "",
    channelIds: channelIds || [],
    sendAt: new Date(sendAt).getTime(),
    createdAt: Date.now(),
    sent: false,
    sentAt: null,
    sendResults: [],
  };
  posts.push(post);
  await env.BOT_DB.put("scheduled_posts", JSON.stringify(posts));
  return json({ ok: true, post }, corsHeaders);
}

async function handleCancelScheduled(id, env, corsHeaders) {
  const posts = await env.BOT_DB.get("scheduled_posts").then(r => r ? JSON.parse(r) : []);
  const filtered = posts.filter(p => p.id !== id);
  await env.BOT_DB.put("scheduled_posts", JSON.stringify(filtered));
  return json({ ok: true }, corsHeaders);
}

// ─── Logs ────────────────────────────────────────────────────────────────────
async function handleGetLogs(env, corsHeaders) {
  // Return empty logs for now — can be extended with audit logging
  return json({ logs: [] }, corsHeaders);
}

// ─── HTML Pages ──────────────────────────────────────────────────────────────
function getLoginHtml(corsHeaders) {
  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Panel Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 min-h-screen flex items-center justify-center">
  <div class="bg-gray-800 p-8 rounded-xl shadow-xl w-96">
    <h1 class="text-2xl font-bold text-white text-center mb-6">پنل ادمین</h1>
    <form onsubmit="login(event)">
      <input id="pw" type="password" placeholder="پسورد" class="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 mb-4">
      <button type="submit" class="w-full p-3 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700">ورود</button>
    </form>
    <p id="err" class="text-red-400 text-sm mt-3 text-center hidden"></p>
  </div>
  <script>
    async function login(e) {
      e.preventDefault();
      const pw = document.getElementById('pw').value;
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({password: pw})
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
        window.location.href = '/dashboard';
      } else {
        document.getElementById('err').textContent = data.error || 'خطا';
        document.getElementById('err').classList.remove('hidden');
      }
    }
  </script>
</body></html>`;
  return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
}

function getDashboardHtml(request, env, corsHeaders) {
  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 min-h-screen text-white">
  <div class="container mx-auto p-6">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-bold">داشبورد</h1>
      <button onclick="logout()" class="bg-red-600 px-4 py-2 rounded-lg">خروج</button>
    </div>
    <div id="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-gray-800 p-4 rounded-xl"><div class="text-3xl font-bold" id="ch-count">-</div><div class="text-gray-400">کانال‌ها</div></div>
      <div class="bg-gray-800 p-4 rounded-xl"><div class="text-3xl font-bold" id="sched-count">-</div><div class="text-gray-400">زمان‌بندی‌ها</div></div>
      <div class="bg-gray-800 p-4 rounded-xl"><div class="text-3xl font-bold" id="pending-count">-</div><div class="text-gray-400">در انتظار</div></div>
      <div class="bg-gray-800 p-4 rounded-xl"><div class="text-3xl font-bold" id="admin-count">-</div><div class="text-gray-400">ادمین‌ها</div></div>
    </div>
    <div class="bg-gray-800 p-6 rounded-xl">
      <h2 class="text-xl font-bold mb-4">آخرین زمان‌بندی‌ها</h2>
      <div id="posts" class="text-gray-400">در حال بارگذاری...</div>
    </div>
  </div>
  <script>
    const token = localStorage.getItem('token');
    if (!token) window.location.href = '/login';
    fetch('/api/dashboard', {headers:{'Authorization':'Bearer '+token}})
      .then(r=>r.json()).then(d=>{
        document.getElementById('ch-count').textContent=d.channels;
        document.getElementById('sched-count').textContent=d.scheduledPosts;
        document.getElementById('pending-count').textContent=d.pendingPosts;
        document.getElementById('admin-count').textContent=d.admins;
        const postsDiv=document.getElementById('posts');
        if(d.recentPosts?.length){
          postsDiv.innerHTML=d.recentPosts.map(p=>'<div class="border-b border-gray-700 py-2">'+p.prompt?.slice(0,80)+' — '+(p.sent?'✅':'⏰')+'</div>').join('');
        } else { postsDiv.textContent='هیچ زمان‌بندی‌ای ثبت نشده'; }
      }).catch(()=>{window.location.href='/login'});
    function logout(){localStorage.removeItem('token');window.location.href='/login';}
  </script>
</body></html>`;
  return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function json(data, corsHeaders = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
