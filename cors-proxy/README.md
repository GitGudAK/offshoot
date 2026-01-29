# Offshoot CORS Proxy

Google Cloud Function that proxies HTTP requests to bypass CORS restrictions for the Offshoot image scraper.

## Deploy to Google Cloud

### Prerequisites

1. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed
2. A GCP project with billing enabled
3. Cloud Functions API enabled

### Quick Deploy

```bash
# Login to GCP
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Deploy the function
gcloud functions deploy corsProxy \
  --gen2 \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region us-central1 \
  --memory 256MB \
  --timeout 60s \
  --source .
```

### Your Proxy URL

After deployment, you'll get a URL like:
```
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/corsProxy
```

## Usage

```
GET /?url=https://example.com/page
```

### Response Format

```json
{
  "contents": "<html>...</html>",
  "status": {
    "url": "https://example.com/page",
    "content_type": "text/html",
    "http_code": 200
  }
}
```

## Configuration

### Domain Restriction

Edit `index.js` and update `ALLOWED_ORIGINS`:

```javascript
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://yourapp.com',      // Add your production domain
  'https://www.yourapp.com',
];
```

Then uncomment the origin check in the function:

```javascript
if (!isAllowed) {
  return res.status(403).json({ error: 'Origin not allowed' });
}
```

### Update Offshoot

After deploying, update Offshoot to use your proxy as the primary:

In `modules/product-scraper.js`, add your proxy URL at the top of the proxies array:

```javascript
this.proxies = [
  { name: 'gcp', url: 'https://YOUR_FUNCTION_URL/?url=', type: 'json', key: 'contents' },
  // ... other fallbacks
];
```

## Costs

| Tier | Invocations | Price |
|------|-------------|-------|
| Free | 2M/month | $0 |
| Paid | Per million | ~$0.40 |

Most small-to-medium apps stay within the free tier.

## Security Features

- ✅ Origin restriction (configurable)
- ✅ Internal URL blocking (localhost, private IPs)
- ✅ 30-second timeout
- ✅ HTTP/HTTPS only
- ✅ Standard browser User-Agent
