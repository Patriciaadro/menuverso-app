# Menuverso — Auth emails (paste-ready Supabase templates) · bilingual ES + EN

Where these go: **Supabase → Authentication → Email Templates**. Paste the **Subject** into the
subject field and the **HTML** into the message body. Supabase fills `{{ .ConfirmationURL }}`
(the action link) and `{{ .Email }}` automatically — keep those tokens exactly as written.
Each email is fully bilingual: Spanish first, then a full English mirror, with one shared
button (bilingual label). Styling is inline so it renders everywhere (no web fonts).

Sender (set in SMTP settings): `Menuverso <info@menuverso.com>`.

---

## 1. Confirm signup  →  Supabase template: "Confirm signup"
**The double opt-in / activation email — the account can't log in until this link is clicked.**

**Subject:** `Activa tu cuenta de Menuverso · Activate your Menuverso account`

```html
<!doctype html><html><body style="margin:0;background:#FAF6EE;font-family:Archivo,Arial,Helvetica,sans-serif;color:#16110F;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="font-family:'Kaushan Script',cursive;font-size:30px;color:#F4291A;">menuverso</div>

    <!-- ESPAÑOL -->
    <div style="font-family:'Anton',Impact,Arial,sans-serif;font-size:32px;text-transform:uppercase;letter-spacing:-.01em;color:#16110F;margin-top:18px;line-height:1.02;">Activa tu cuenta</div>
    <p style="font-size:16px;line-height:1.55;margin:14px 0 0;">¡Bienvenido a <strong>Menuverso</strong>! Solo queda un paso: confirma tu email para activar tu cuenta y empezar a canjear ofertas 2×1 en Barcelona.</p>

    <p style="margin:26px 0;">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#F4291A;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:15px 28px;border-radius:4px;box-shadow:5px 5px 0 #16110F;">Activar mi cuenta · Activate account →</a>
    </p>

    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:0;">¿El botón no funciona? Copia y pega este enlace:<br><a href="{{ .ConfirmationURL }}" style="color:#C81C10;word-break:break-all;">{{ .ConfirmationURL }}</a></p>
    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:14px 0 0;">El enlace caduca en 24 horas. Si no creaste esta cuenta, ignora este email.</p>

    <hr style="border:none;border-top:1px solid #E5DFD2;margin:26px 0;">

    <!-- ENGLISH -->
    <div style="font-family:'Anton',Impact,Arial,sans-serif;font-size:28px;text-transform:uppercase;letter-spacing:-.01em;color:#16110F;line-height:1.02;">Activate your account</div>
    <p style="font-size:15px;line-height:1.55;margin:12px 0 0;">Welcome to <strong>Menuverso</strong>! One last step: confirm your email to activate your account and start redeeming 2-for-1 deals across Barcelona. Tap the button above.</p>
    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:12px 0 0;">The link expires in 24 hours. If you didn't sign up, just ignore this email.</p>

    <p style="font-size:11px;color:#ABA399;margin:22px 0 0;">Menuverso · Barcelona · <a href="mailto:info@menuverso.com" style="color:#ABA399;">info@menuverso.com</a></p>
  </div>
</body></html>
```

---

## 2. Reset password  →  Supabase template: "Reset Password"

**Subject:** `Restablece tu contraseña · Reset your Menuverso password`

```html
<!doctype html><html><body style="margin:0;background:#FAF6EE;font-family:Archivo,Arial,Helvetica,sans-serif;color:#16110F;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="font-family:'Kaushan Script',cursive;font-size:30px;color:#F4291A;">menuverso</div>

    <!-- ESPAÑOL -->
    <div style="font-family:'Anton',Impact,Arial,sans-serif;font-size:32px;text-transform:uppercase;letter-spacing:-.01em;color:#16110F;margin-top:18px;line-height:1.02;">Nueva contraseña</div>
    <p style="font-size:16px;line-height:1.55;margin:14px 0 0;">Has pedido restablecer la contraseña de tu cuenta de Menuverso. Pulsa el botón para elegir una nueva.</p>

    <p style="margin:26px 0;">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#F4291A;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:15px 28px;border-radius:4px;box-shadow:5px 5px 0 #16110F;">Cambiar contraseña · Reset password →</a>
    </p>

    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:0;">¿El botón no funciona? Copia y pega este enlace:<br><a href="{{ .ConfirmationURL }}" style="color:#C81C10;word-break:break-all;">{{ .ConfirmationURL }}</a></p>
    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:14px 0 0;">El enlace caduca en 1 hora. Si no fuiste tú, ignora este email — tu contraseña no cambiará.</p>

    <hr style="border:none;border-top:1px solid #E5DFD2;margin:26px 0;">

    <!-- ENGLISH -->
    <div style="font-family:'Anton',Impact,Arial,sans-serif;font-size:28px;text-transform:uppercase;letter-spacing:-.01em;color:#16110F;line-height:1.02;">Reset your password</div>
    <p style="font-size:15px;line-height:1.55;margin:12px 0 0;">You asked to reset your Menuverso password. Use the button above to choose a new one.</p>
    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:12px 0 0;">The link expires in 1 hour. If this wasn't you, ignore this email — your password won't change.</p>

    <p style="font-size:11px;color:#ABA399;margin:22px 0 0;">Menuverso · Barcelona · <a href="mailto:info@menuverso.com" style="color:#ABA399;">info@menuverso.com</a></p>
  </div>
</body></html>
```

---

## 3. Magic link (passwordless login) — optional  →  Supabase template: "Magic Link"

**Subject:** `Tu enlace de acceso · Your Menuverso sign-in link`

```html
<!doctype html><html><body style="margin:0;background:#FAF6EE;font-family:Archivo,Arial,Helvetica,sans-serif;color:#16110F;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="font-family:'Kaushan Script',cursive;font-size:30px;color:#F4291A;">menuverso</div>

    <!-- ESPAÑOL -->
    <div style="font-family:'Anton',Impact,Arial,sans-serif;font-size:32px;text-transform:uppercase;letter-spacing:-.01em;color:#16110F;margin-top:18px;line-height:1.02;">Entra al universo</div>
    <p style="font-size:16px;line-height:1.55;margin:14px 0 0;">Pulsa el botón para entrar en tu cuenta de Menuverso. No necesitas contraseña.</p>

    <p style="margin:26px 0;">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#F4291A;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:15px 28px;border-radius:4px;box-shadow:5px 5px 0 #16110F;">Iniciar sesión · Sign in →</a>
    </p>

    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:0;">El enlace caduca en 1 hora y solo funciona una vez. Si no lo pediste, ignora este email.</p>

    <hr style="border:none;border-top:1px solid #E5DFD2;margin:26px 0;">

    <!-- ENGLISH -->
    <div style="font-family:'Anton',Impact,Arial,sans-serif;font-size:28px;text-transform:uppercase;letter-spacing:-.01em;color:#16110F;line-height:1.02;">Enter the universe</div>
    <p style="font-size:15px;line-height:1.55;margin:12px 0 0;">Tap the button above to sign in to Menuverso — no password needed. The link expires in 1 hour and works once. If you didn't request it, ignore this email.</p>

    <p style="font-size:11px;color:#ABA399;margin:22px 0 0;">Menuverso · Barcelona · <a href="mailto:info@menuverso.com" style="color:#ABA399;">info@menuverso.com</a></p>
  </div>
</body></html>
```

---

## 4. Change email address — optional  →  Supabase template: "Change Email Address"

**Subject:** `Confirma tu nuevo email · Confirm your new Menuverso email`

```html
<!doctype html><html><body style="margin:0;background:#FAF6EE;font-family:Archivo,Arial,Helvetica,sans-serif;color:#16110F;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="font-family:'Kaushan Script',cursive;font-size:30px;color:#F4291A;">menuverso</div>

    <!-- ESPAÑOL -->
    <div style="font-family:'Anton',Impact,Arial,sans-serif;font-size:32px;text-transform:uppercase;letter-spacing:-.01em;color:#16110F;margin-top:18px;line-height:1.02;">Confirma tu email</div>
    <p style="font-size:16px;line-height:1.55;margin:14px 0 0;">Has pedido cambiar el email de tu cuenta a <strong>{{ .Email }}</strong>. Confirma para aplicar el cambio.</p>

    <p style="margin:26px 0;">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#F4291A;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:15px 28px;border-radius:4px;box-shadow:5px 5px 0 #16110F;">Confirmar email · Confirm email →</a>
    </p>

    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:0;">Si no pediste este cambio, ignora este email y tu cuenta seguirá igual.</p>

    <hr style="border:none;border-top:1px solid #E5DFD2;margin:26px 0;">

    <!-- ENGLISH -->
    <div style="font-family:'Anton',Impact,Arial,sans-serif;font-size:28px;text-transform:uppercase;letter-spacing:-.01em;color:#16110F;line-height:1.02;">Confirm your email</div>
    <p style="font-size:15px;line-height:1.55;margin:12px 0 0;">You asked to change your account email to <strong>{{ .Email }}</strong>. Confirm with the button above. If this wasn't you, ignore this email and nothing changes.</p>

    <p style="font-size:11px;color:#ABA399;margin:22px 0 0;">Menuverso · Barcelona · <a href="mailto:info@menuverso.com" style="color:#ABA399;">info@menuverso.com</a></p>
  </div>
</body></html>
```

---

## 5. Partner lead acknowledgement (restaurant contact form)

**Not a Supabase Auth template.** This is the email you send a restaurant after they submit the
"list your restaurant" form (`/alta`). It can be sent automatically (a small Resend serverless
function fired on form submit — I can wire that) or used as a manual reply template. Placeholders
`{{venue}}` and `{{contact}}` are filled by whatever sends it.

**Subject:** `Gracias por tu interés en Menuverso · Thanks for your interest in Menuverso`

```html
<!doctype html><html><body style="margin:0;background:#FAF6EE;font-family:Archivo,Arial,Helvetica,sans-serif;color:#16110F;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="font-family:'Kaushan Script',cursive;font-size:30px;color:#F4291A;">menuverso</div>

    <!-- ESPAÑOL -->
    <div style="font-family:'Anton',Impact,Arial,sans-serif;font-size:30px;text-transform:uppercase;letter-spacing:-.01em;color:#16110F;margin-top:18px;line-height:1.05;">Hemos recibido tu solicitud</div>
    <p style="font-size:16px;line-height:1.55;margin:14px 0 0;">Hola {{contact}}, gracias por tu interés en sumar <strong>{{venue}}</strong> a Menuverso. Nuestro equipo revisará tu solicitud y te contactará en <strong>1–2 días laborables</strong> para configurar tus ofertas 2×1.</p>
    <p style="font-size:16px;line-height:1.55;margin:12px 0 0;">Sin cuota de alta, sin suscripción mensual y sin comisiones — solo llenas mesas en tus horas flojas.</p>

    <hr style="border:none;border-top:1px solid #E5DFD2;margin:26px 0;">

    <!-- ENGLISH -->
    <div style="font-family:'Anton',Impact,Arial,sans-serif;font-size:26px;text-transform:uppercase;letter-spacing:-.01em;color:#16110F;line-height:1.05;">We've got your request</div>
    <p style="font-size:15px;line-height:1.55;margin:12px 0 0;">Hi {{contact}}, thanks for your interest in adding <strong>{{venue}}</strong> to Menuverso. Our team will review it and get in touch within <strong>1–2 business days</strong> to set up your 2-for-1 offers.</p>
    <p style="font-size:15px;line-height:1.55;margin:12px 0 0;">No setup fee, no monthly subscription, no commission — just fuller tables in your quiet hours.</p>

    <p style="font-size:13px;line-height:1.5;color:#6E655A;margin:22px 0 0;">¿Tienes dudas? Responde a este email o escríbenos a <a href="mailto:info@menuverso.com" style="color:#C81C10;">info@menuverso.com</a>. · Questions? Just reply, or email <a href="mailto:info@menuverso.com" style="color:#C81C10;">info@menuverso.com</a>.</p>
    <p style="font-size:11px;color:#ABA399;margin:16px 0 0;">Menuverso · Barcelona · <a href="mailto:info@menuverso.com" style="color:#ABA399;">info@menuverso.com</a></p>
  </div>
</body></html>
```

---

### Notes
- **Required for the plan:** #1 (Confirm signup) and #2 (Reset Password). #3 and #4 are optional. #5 is the partner-lead acknowledgement (not an Auth template).
- These are **single bilingual emails** (ES then EN) — the robust choice since Supabase sends one template to everyone. If you'd rather send a *separate* Spanish-only or English-only email based on the user's language, Supabase supports per-locale templates but it needs extra setup (passing a locale at signup + locale-keyed templates) — tell me and I'll spec that instead.
- Keep `{{ .ConfirmationURL }}` and `{{ .Email }}` exactly as written.
- Anton/Kaushan won't load in most email clients (they fall back to bold/cursive system faces). For a pixel-perfect logo in email, replace the `menuverso` text line with an `<img>` of the outlined wordmark hosted on your domain.
- Expiry wording matches Supabase defaults (signup 24h, recovery/magic-link 1h); update the copy if you change token lifetimes.
