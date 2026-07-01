# Email delivery — настройка Resend SMTP + PocketBase шаблоны (2026-07-01)

**Date:** 2026-07-01  
**Status:** Частично работает (dev → Yandex ✓ ранее; prod → bounce из-за `noreply` адреса)  
**Branch:** `dev` + `main` (production)

---

## Цель

Настроить транзакционные письма (подтверждение email, сброс пароля, смена email) через Resend SMTP для обоих окружений PocketBase: dev и production.

---

## Инфраструктура

### Домен

- **Основной домен:** `cashbackbrain.ru` (регистратор: Timeweb)
- **Отправитель (правильный):** `hello@cashbackbrain.ru` ← физический ящик не нужен, домен верифицирован в Resend
- **Отправитель (был неверным):** `noreply@cashbackbrain.ru` — вызывал `550 Disabled` на Яндексе и Gmail

### Resend

- **Сервис:** [resend.com](https://resend.com) — аккаунт `kseniya.agrova@gmail.com`
- **Верифицированный домен:** `cashbackbrain.ru` (статус: Verified)
- **SMTP реквизиты:**
  ```
  Host:     smtp.resend.com
  Port:     587 (STARTTLS)
  Username: resend
  Password: <Resend API key из настроек аккаунта>
  ```

### DNS-записи в Timeweb (добавлены вручную)

| Тип  | Хост                              | Значение                                      |
|------|-----------------------------------|-----------------------------------------------|
| TXT  | `resend._domainkey.cashbackbrain.ru` | DKIM-запись из Resend (начинается с `p=`)  |
| MX   | `send.cashbackbrain.ru`           | `feedback-smtp.eu-west-1.amazonses.com`      |
| TXT  | `send.cashbackbrain.ru`           | `v=spf1 include:amazonses.com ~all`          |
| TXT  | `_dmarc.cashbackbrain.ru`         | `v=DMARC1; p=none;`                          |

---

## Настройка PocketBase (оба окружения)

### Mail settings (Settings → Mail settings)

| Поле           | Значение                      |
|----------------|-------------------------------|
| Sender name    | `CashbackBrain`               |
| Sender address | `hello@cashbackbrain.ru`      |
| SMTP host      | `smtp.resend.com`             |
| Port           | `587`                         |
| Username       | `resend`                      |
| Password       | Resend API key                |

### Application URL (Settings → Application)

| Окружение   | Application URL                   |
|-------------|-----------------------------------|
| dev         | `https://dev.cashbackbrain.ru`    |
| production  | `https://cashbackbrain.ru`        |

Это критично: `{APP_URL}` в шаблонах писем подставляется отсюда. Если оставить `localhost:8090` — ссылки в письмах будут вести на localhost.

---

## HTML-шаблоны писем (Settings → Mail settings → Templates)

Используют плейсхолдеры PocketBase: `{APP_URL}`, `{APP_NAME}`, `{TOKEN}`, `{EMAIL}`.

### Ключевые детали

- Логотип: `<img src="{APP_URL}/images/pwa/icon-192.png">` (PNG 192×192, новый brain-логотип)
- Кнопка: жёлтый фон `#fef08a`, тёмный текст `#1e293b`, скруглённая `border-radius:12px`
- Фон письма: `#f1f5f9`, карточка: белая, `border-radius:16px`
- **Тест-письмо из Mail settings использует дефолтный шаблон PocketBase**, а не кастомные — для проверки кастомных шаблонов нужно делать реальное действие (регистрация, сброс пароля)

### Verification (подтверждение email)

```
Тема:    Подтвердите ваш email
Кнопка:  Подтвердить email
Ссылка:  {APP_URL}/verify-email?token={TOKEN}
```

Frontend-маршрут: [app/verify-email/page.tsx](app/verify-email/page.tsx) — читает `?token=` из URL и вызывает PocketBase API.

### Password reset (сброс пароля)

```
Тема:    Сброс пароля
Кнопка:  Задать новый пароль
Ссылка:  {APP_URL}/reset-password?token={TOKEN}
```

Frontend-маршрут: [app/reset-password/page.tsx](app/reset-password/page.tsx).

### Email change (смена email)

```
Тема:    Подтвердите новый email
Кнопка:  Подтвердить новый email
Ссылка:  {APP_URL}/_/#/auth/confirm-email-change/{TOKEN}
```

Этот маршрут обрабатывает сам PocketBase (не frontend), поэтому путь `/_/#/...` — исключение.

---

## Известные проблемы и решения

### `550 Disabled` от Яндекса / Gmail bounce

**Причина:** Использование `noreply` в адресе отправителя — Resend Insights прямо флагует "Don't use no-reply". Яндекс и Gmail блокируют письма с таким адресом.

**Решение:** Сменить Sender address на `hello@cashbackbrain.ru` в обоих PocketBase.

### Gmail "Undetermined bounce"

**Причина:** Новый домен без репутации. Gmail особенно строг к доменам моложе 2 недель.

**Решение:** Ждать накопления репутации (1-2 недели активной отправки без bounce).

### Ссылки в письмах вели на `localhost:8090/_/`

**Причина:** Application URL в PocketBase не был обновлён с дефолтного `localhost:8090`. Использовался URL-формат PocketBase admin (`/_/#/auth/confirm-verification/...`) вместо кастомных frontend-маршрутов.

**Решение:** Обновить Application URL + исправить href в шаблонах на `/verify-email?token={TOKEN}`.

### Bounce из-за Shared IP Resend (возможно)

**Симптом:** `550 Disabled` — жёсткий блок, не временный.

**Если проблема сохранится после смены адреса:** Рассмотреть платный план Resend ($20/мес, dedicated IP) или альтернативные SMTP-провайдеры с репутацией у RU-провайдеров (Unisender, SendPulse).

---

## Чек-лист настройки нового окружения PocketBase

- [ ] Settings → Application → Application URL: `https://<домен>`
- [ ] Settings → Application → Application name: `CashbackBrain`
- [ ] Settings → Mail settings → Sender name: `CashbackBrain`
- [ ] Settings → Mail settings → Sender address: `hello@cashbackbrain.ru`
- [ ] Settings → Mail settings → SMTP: `smtp.resend.com:587`, user `resend`, password = Resend API key
- [ ] Templates → Verification: обновить HTML + href на `{APP_URL}/verify-email?token={TOKEN}`
- [ ] Templates → Password reset: обновить HTML + href на `{APP_URL}/reset-password?token={TOKEN}`
- [ ] Templates → Email change: обновить HTML + href на `{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}`
- [ ] Проверить реальным действием (регистрация), а не кнопкой "Send test email"
