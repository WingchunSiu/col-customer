# Flareflow Email Assistant

AI-powered automated email response system using Zhipu AI. Processes unread emails, generates intelligent draft replies, and saves them to your email drafts folder.

## Features

- 🤖 **AI-Powered Analysis**: Categorizes emails and determines priority using Zhipu AI
- ✉️ **Auto Draft Generation**: Creates contextual email replies based on templates
- 📥 **IMAP Integration**: Fetches unread emails and saves drafts directly to your mailbox
- ⏰ **Automated Processing**: Runs hourly via GitHub Actions
- 📊 **Smart Filtering**: Only generates replies for important emails that need responses
- 🔒 **Security**: Uses GitHub Secrets for sensitive credentials

## Setup Instructions

### 1. Configure GitHub Secrets

Go to your repository's **Settings → Secrets and variables → Actions** and add these secrets:

#### Email Configuration
- `IMAP_HOST`: IMAP server host (e.g., `imap.gmail.com`, `imap.secureserver.net`)
- `IMAP_PORT`: IMAP port (e.g., `993`)
- `IMAP_USER`: Your email address (e.g., `support@example.com`)
- `IMAP_PASSWORD`: Your email password or app-specific password
- `IMAP_TLS`: Use TLS (`true`)
- `DRAFTS_MAILBOX`: Drafts folder name (default: `Drafts`)
- `REPLY_FROM_ADDRESS`: Reply-from address (usually same as `IMAP_USER`)
- `REPLY_FROM_NAME`: Your name or company name (e.g., `Support Team`)

#### AI Configuration
- `ZHIPU_API_KEY`: Your Zhipu AI API key

### 2. Enable GitHub Actions

The workflow is configured in [`.github/workflows/process-emails.yml`](.github/workflows/process-emails.yml)

- **Schedule**: Runs automatically every hour at minute 0
- **Manual Trigger**: Can be triggered manually via "Actions" tab → "Run workflow"

### 3. Local Development

#### Install Dependencies
```bash
npm install
```

#### Create `.env` File
```bash
# Email Configuration
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@example.com
IMAP_PASSWORD=your-password
IMAP_TLS=true
DRAFTS_MAILBOX=Drafts
REPLY_FROM_ADDRESS=your-email@example.com
REPLY_FROM_NAME=Your Name

# AI Configuration
ZHIPU_API_KEY=your-zhipu-api-key

# Processing Configuration
SAVE_DRAFTS=true
MARK_AS_READ=true
```

#### Build the Project
```bash
npm run build
```

#### Run Locally
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

## How It Works

1. **Fetch Unread Emails**: Connects to your IMAP server and retrieves unread messages
2. **AI Analysis**: Each email is analyzed by Zhipu AI to determine:
   - Category (technical support, billing, feature request, etc.)
   - Sentiment (positive, neutral, negative)
   - Priority (low, medium, high, urgent)
   - Whether it needs a reply
3. **Generate Response**: For important emails, generates a contextual reply using AI and templates
4. **Save Draft**: Stores the generated reply as a draft in your email client
5. **Mark as Read**: Marks processed emails as read to prevent duplicate processing

## Configuration Options

### Environment Variables

- `SAVE_DRAFTS`: Set to `true` to save generated replies as drafts (default: `true`)
- `MARK_AS_READ`: Set to `true` to mark processed emails as read (default: `false` locally, `true` in CI)

### Processing Behavior

- **Duplicate Prevention**: Emails are marked as read after processing to prevent re-processing
- **Error Handling**: Failed emails are skipped without marking as read, allowing retry on next run
- **Rate Limiting**: Processes up to 50 unread emails per run

## Templates

Email response templates are defined in [`templates.json`](templates.json). The AI matches incoming emails to appropriate templates and generates contextual responses.

## Testing

### Test with Real Emails
```bash
npx tsx src/testRealEmails.ts
```

### Test Draft Saving
```bash
npx tsx src/testDraft.ts
```

## Monitoring

### GitHub Actions Logs
- Go to **Actions** tab in your repository
- Click on the latest "Process Unread Emails" workflow run
- View detailed logs of email processing
- All logs are displayed directly in the workflow console

## Security Notes

- ⚠️ Never commit your `.env` file to version control
- ✅ Use app-specific passwords when available (e.g., Gmail App Passwords)
- ✅ All sensitive data is stored in GitHub Secrets
- ✅ Email headers are sanitized to prevent injection attacks

## Troubleshooting

### IMAP Connection Issues
- Verify IMAP is enabled in your email provider settings
- Check firewall/network restrictions
- For Gmail: Enable "Less secure app access" or use App Passwords

### AI API Issues
- Verify your Zhipu API key is valid and has sufficient credits
- Check API rate limits

### Draft Saving Issues
- Verify the drafts mailbox name matches your email provider
- Common names: `Drafts`, `[Gmail]/Drafts`, `Draft`

## License

MIT
