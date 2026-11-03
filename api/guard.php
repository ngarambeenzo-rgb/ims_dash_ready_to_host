<?php
/* IMS — guard.php (public)
   Put this on a website we built for a client:

       <script src="https://YOUR-IMS/api/guard.php?t=DEPLOYMENT_TOKEN" defer></script>

   Each page view it tells IMS "I am alive, this is my version", and if we paused the
   site (or the client's subscription ended) it covers the page with a message.
   If IMS cannot be reached the site stays up: a problem on our side never takes a client offline. */

require_once __DIR__ . '/../config/db.php';
$db = getDB();
$token = preg_replace('/[^a-f0-9]/', '', $_GET['t'] ?? '');
$action = $_GET['action'] ?? 'js';

function guard_row($db, $token) {
    if (strlen($token) < 16) return null;
    $st = $db->prepare('SELECT dp.id, dp.status, dp.pause_message, c.status AS client_status, c.business_name, c.contact_phone
                        FROM ims_deployments dp JOIN ims_clients c ON c.id = dp.client_id WHERE dp.token = ? LIMIT 1');
    $st->execute([$token]);
    return $st->fetch() ?: null;
}

if ($action === 'status') {
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: no-store');
    $r = guard_row($db, $token);
    if (!$r) { echo json_encode(['ok' => false]); exit; }
    $ver = substr(trim($_GET['v'] ?? ''), 0, 20);
    $db->prepare('UPDATE ims_deployments SET last_seen = NOW(), version = COALESCE(NULLIF(?, ""), version) WHERE id = ?')->execute([$ver, $r['id']]);
    $reason = null;
    if ($r['status'] === 'paused') $reason = $r['pause_message'] ?: 'This service is temporarily unavailable.';
    elseif (in_array($r['client_status'], ['expired', 'suspended'], true)) $reason = 'This service is paused because the subscription needs renewing. Please contact ' . $r['business_name'] . ($r['contact_phone'] ? ' on ' . $r['contact_phone'] : '') . '.';
    echo json_encode(['ok' => true, 'paused' => $reason !== null, 'message' => $reason]);
    exit;
}

// The script itself
header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-cache');
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$base = $scheme . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
$tokenJs = json_encode($token); $baseJs = json_encode($base);
echo <<<JS
(function () {
  var T = $tokenJs, B = $baseJs;
  var v = (window.IMS_VERSION || (document.querySelector('meta[name="app-version"]') || {}).content || '');
  fetch(B + '/guard.php?action=status&t=' + T + '&v=' + encodeURIComponent(v), { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.paused) return;
      var o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0b0d12;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:system-ui,sans-serif';
      var b = document.createElement('div'); b.style.maxWidth = '460px';
      var h = document.createElement('h1'); h.textContent = 'Service paused'; h.style.cssText = 'font-size:24px;margin:0 0 12px';
      var p = document.createElement('p'); p.textContent = d.message || ''; p.style.cssText = 'font-size:16px;line-height:1.5;color:#cbd5e1;margin:0';
      b.appendChild(h); b.appendChild(p); o.appendChild(b); document.documentElement.appendChild(o);
      document.documentElement.style.overflow = 'hidden';
    })
    .catch(function () { /* IMS unreachable: leave the site running */ });
})();
JS;
