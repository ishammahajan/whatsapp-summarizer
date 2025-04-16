# WhatsApp Summarizer

A tool that connects to WhatsApp and summarizes conversations using a locally hosted LLM via LMStudio.

## Features

- Connect to WhatsApp through web.js
- Auto-summarize group chats every 250 messages
- Command-based summary generation (!summarize)
- Interactive CLI for chat exploration and summarization
- Export/import chat logs with summaries
- Reply context understanding for better summarization

## Prerequisites

- Node.js 14+
- Local LLM running via LMStudio on port 1234
- WhatsApp account

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/whatsapp-summarizer.git
   cd whatsapp-summarizer
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create .env file from example:
   ```
   cp .env.example .env
   ```

4. Edit .env to match your configuration

## Usage

### Start the interactive client:

```
npm start
```

This will:
1. Generate a QR code to connect to WhatsApp
2. Scan the QR code with your WhatsApp mobile app
3. Display available chats once connected
4. Allow interaction through the command prompt

### Available Commands

In the interactive mode:

- `summarize [filename]` - Summarize a previously saved chat file
- `[chat ID or index] [number of messages]` - Fetch messages from a specific chat
- `exit` - Exit the application

Within WhatsApp:
- `!summarize [number]` - Generate a summary of the most recent messages in the current chat

### CLI Usage

```
npm run cli summarize ./data/your-chat-file.json
```

## Configuration

The following environment variables can be set in the `.env` file:

- `LM_STUDIO_API_URL` - URL for the LLM API (default: http://localhost:1234/v1/chat/completions)
- `MAX_CONTEXT_TOKENS` - Maximum tokens for context window (default: 4096)
- `MAX_CONTEXT_FOR_MESSAGES` - Tokens reserved for messages (default: 3000)
- `MAX_COMPLETION_TOKENS` - Tokens reserved for completion (default: 900)
- `LLM_TEMPERATURE` - LLM temperature setting (default: 0.1)
- `AUTO_SUMMARY_THRESHOLD` - Message count to trigger auto-summary (default: 250)
- `DATA_PATH` - Path to store data files (default: ./data)

## Project Structure

```
whatsapp-summarizer/
├── config/
│   └── config.js          # Configuration variables
├── src/
│   ├── client/
│   │   └── whatsapp.js    # WhatsApp client setup and initialization
│   ├── commands/
│   │   ├── handlers.js    # Command handlers (summarize, fetch, etc.)
│   │   └── index.js       # Command registration and routing
│   ├── lib/
│   │   ├── formatting.js  # Message formatting functions
│   │   ├── tokenizer.js   # Token counting and management
│   │   └── storage.js     # File storage utilities
│   ├── services/
│   │   └── llm.js         # LLM integration and summarization logic
│   ├── utils/
│   │   └── logger.js      # Logging utilities
│   ├── cli.js             # CLI interface
│   ├── events.js          # Event handlers (message events)
│   └── index.js           # Application entry point
├── .env.example           # Example environment variables
├── package.json           # Project dependencies and scripts
└── README.md              # Project documentation
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.