# Party Game Hub

A real-time browser party game site with two game modes:

- Imposter Game
- Guess Who

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and set a private admin upload password:

```env
ADMIN_UPLOAD_PASSWORD=your-private-password
```

Then start the server:

```bash
npm start
```

Open the site at:

```text
http://localhost:3000
```

## Guess Who character library

Open the site, choose **Admin: Manage Guess Who Characters**, enter the admin password, then upload images or a folder of images.

The character name is created from the filename:

```text
robert-downey-jr.webp -> Robert Downey Jr
eren_yeager.png -> Eren Yeager
```

Uploaded Guess Who images are stored in:

```text
public/uploads/guess-who-library/
```

Character metadata is stored in:

```text
data/guess-who-characters.json
```

If you deploy to a host with an ephemeral filesystem, these uploads may disappear after redeploys or restarts. In that case, move uploads to persistent storage such as Cloudinary, S3, Supabase Storage, or a mounted persistent disk.
