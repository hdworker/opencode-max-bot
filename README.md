<div align="center">

# 🤖 opencode-max-bot

**Максимально живой ассистент: OpenCode прямо в мессенджере MAX**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/package-json/v/hdworker/opencode-max-bot)](package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![OpenCode SDK](https://img.shields.io/badge/opencode%20sdk-%5E1.1.21-6b5ce7)](package.json)
[![Platform](https://img.shields.io/badge/platform-MAX%20messenger-0091FF?logo=vk&logoColor=white)](https://max.ru)
[![Locale](https://img.shields.io/badge/locale-ru%20%2F%20en-8A2BE2)](#i18n)
[![Made in Russia](https://img.shields.io/badge/made%20in-RU-ff6b6b)]()

</div>

---

## 🇷🇺 Проблема: Telegram и РФ

Исторически Telegram был любимым каналом управления AI-агентами: тысячи ботов, удобные
long-polling API, инлайн-клавиатуры, сессии. Однако для российских разработчиков этот
сценарий давно перестал быть надёжным:

- **Блокировки и замедление трафика (ТСПУ).** Telegram регулярно ограничивается
  на уровне провайдеров: скорость падает до нерабочего состояния, сообщения и
  `getUpdates` уходят с многоминутными задержками, боты «отваливаются» без предупреждения.
- **Постоянные попытки деградации качества.** Даже когда «работает», нередко требует VPN,
  а VPN сам по себе — дополнительная точка отказа и простой.
- **Куда смотреть?** Тотальной блокировки нет, но и стабильности нет: бот, который
  запускает длительные кодинг-сессии, не может себе позволить случайный обрыв канала.

Для сервиса, который должен *в фоне* гонять задачи OpenCode и слать статусы каждые
несколько секунд, такая нестабильность — смертельный приговор.

## ✅ Наше решение: свой бот для MAX

Вместо того чтобы воевать с ТСПУ и VPN-серверами, мы приняли решение **реализовать
собственного MAX-бота** — полноценную замену Telegram-боту в мессенджере **MAX**
(VK). Почему именно MAX:

- 🚀 **Работает без VPN из РФ** — российский мессенджер, стабильный канал.
- 💬 **Нативный bot-API** — long polling, callback-клавиатуры, markdown, картинки и файлы.
- 🎛️ **Богатый UI** — inline-клавиатуры прямо в чате: выбор проекта, сессий, моделей — всё в два тапа.
- 🔐 **Авторизация по user_id** — бот общается только с владельцем.

Так родился **opencode-max-bot**: мост между [OpenCode](https://opencode.ai)
(сервер на `localhost:4096`) и мессенджером MAX.

---

## ✨ Возможности

- ⚡ **Управление OpenCode из чата MAX** — отправьте задачу, бот сам её выполнит и пришлёт результат.
- 🖥️ **Автозапуск и авто-рестарт** OpenCode-сервера — мониторинг health, подъём процесса при падении.
- 📁 **Проекты** — список проектов из OpenCode, выбор активного инлайн-кнопками.
- 💬 **Сессии** — создание, переименование, переключение, детач.
- 🤖 **Модели, навыки, MCP** — список и выбор доступных моделей, скиллов и MCP-серверов.
- 🎹 **Интерактив** — permissions и questions (подтверждение действий) прямо в чате.
- ⏹️ **Прерывание** — `/abort` останавливает текущий таск.
- 🔊 **TTS** — озвучка текста (вкл/выкл).
- 🌐 **i18n** — русский и английский языки.
- 🔄 **Стриминг** — ответы и вызовы инструментов стримятся в чат в реальном времени.

## 🗂️ Архитектура

```
src/
├── max/            # MAX Bot API: client, long-polling, команды, рендер, стриминг
│   ├── client.ts       # REST-клиент платформы MAX (platform-api.max.ru)
│   ├── bot.ts          # бот-слой: middleware, команды, колбэки, авторизация
│   ├── commands/       # /start /help /status /new /projects /sessions ... 
│   ├── handlers/       # обработчики модели, прав, промптов, вопросов
│   ├── render/         # pipeline Markdown → формат MAX
│   └── streaming/      # стриминг ответов и tool-call'ов
├── opencode/       # OpenCode SDK-клиент + управление локальным сервером
│   ├── client.ts       # SDK-клиент
│   ├── process.ts      # spawn / stop / поиск PID (Linux/Windows)
│   ├── auto-restart.ts # health-check и авто-рестарт сервера
│   └── ready-lifecycle.ts
├── agent/          # менеджер агентов
├── session/        # менеджер сессий
├── project/        # менеджер проектов
├── model/          # менеджер моделей
├── permission/     # менеджер разрешений
├── question/       # менеджер вопросов
├── pinned/         # закреплённые сообщения
├── variant/        # варианты ответов
├── settings/       # пользовательские настройки
├── i18n/           # ru / en словари
├── keyboard/       # клавиатуры
└── interaction/    # взаимодействие с чатом
```

## 🚀 Установка и запуск

### Требования

- Node.js **>= 20**
- Установленный CLI [OpenCode](https://opencode.ai)
- Бот в мессенджере MAX (создаётся через [Бот API MAX](https://max.ru))

### Шаги

1. **Склонируйте и установите зависимости:**

   ```bash
   git clone https://github.com/hdworker/opencode-max-bot.git
   cd opencode-max-bot
   npm install
   ```

2. **Настройте окружение:**

   ```bash
   cp .env.example .env
   ```

   Заполните ключевые переменные (см. таблицу ниже).

3. **Соберите и запустите:**

   ```bash
   npm run build
   npm start
   ```

   Бот поднимет OpenCode-сервер (при `OPENCODE_AUTO_RESTART_ENABLED=true`), зарегистрируется
   и начнёт отвечать в чате MAX.

## ⚙️ Переменные окружения

| Переменная | Описание | По умолчанию |
|---|---|---|
| `MAX_TOKEN` | Токен бота MAX | — |
| `MAX_ALLOWED_USER_ID` | ID пользователя-владельца (для авторизации) | — |
| `OPENCODE_API_URL` | URL OpenCode-сервера | `http://localhost:4096` |
| `OPENCODE_PASSWORD` | Пароль OpenCode-сервера (если задан) | пусто |
| `OPENCODE_MODEL` | Модель по умолчанию | пусто |
| `OPENCODE_LOCALE` | Язык интерфейса: `ru` / `en` | `ru` |
| `OPENCODE_AUTO_RESTART_ENABLED` | Автозапуск/авто-рестарт сервера | `true` |
| `OPENCODE_MONITOR_INTERVAL_SEC` | Интервал health-check, сек | `30` |
| `LOG_LEVEL` | Уровень логов: `debug` / `info` / `warn` / `error` | `info` |

> 💡 **Как узнать свой user_id?** Запустите `node get-user-id.js` — скрипт выведет ваш ID в чате с ботом.

## ⌨️ Команды

| Команда | Описание |
|---|---|
| `/start` | Запустить бота |
| `/help` | Показать доступные команды |
| `/status` | Текущий статус |
| `/new` | Создать новую сессию |
| `/abort` | Прервать текущую сессию |
| `/sessions` | Список недавних сессий |
| `/projects` | Список проектов (выбор инлайн-кнопками) |
| `/rename` | Переименовать сессию |
| `/detach` | Отключиться от сессии |
| `/worktree` | Информация о git worktree |
| `/open` | Открыть файл в редакторе |
| `/ls` | Содержимое директории |
| `/tts` | Вкл/выкл озвучку |
| `/task` / `/tasklist` | Информация о задаче / список задач |
| `/commands` | Все команды |
| `/skills` | Доступные навыки |
| `/mcps` | MCP-серверы |
| `/models` | Доступные модели |
| `/opencode_start` / `/opencode_stop` | Запустить/остановить OpenCode-сервер |

## 🔧 Разработка

```bash
npm run build    # сборка TypeScript
npm run dev      # сборка + запуск
npm run lint     # ESLint
npm run format   # Prettier
npm run test     # Vitest
```

## 🧱 Технологии

[![OpenCode](https://img.shields.io/badge/OpenCode-AI%20coding%20agent-6b5ce7?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iIzZiNWNlNyIvPjwvc3ZnPg%3D%3D)](https://opencode.ai)
[![MAX](https://img.shields.io/badge/MAX%20Bot%20API-REST%20%2B%20Long%20Polling-0091FF)](https://max.ru)
[![Vite](https://img.shields.io/badge/Tooling-tsx%20%2F%20vitest%20%2F%20eslint%20%2F%20prettier-646464)]()

## 📄 Лицензия

[MIT](LICENSE)
