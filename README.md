# Cryptic Hub

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

## Guess Who character folders

Open the site, choose **Admin: Manage Guess Who Characters**, enter the admin password, then create folders such as:

```text
Football Players
Marvel Characters
Anime Characters
Family/Friends
```

After choosing a folder, upload images into that folder. Character names are created from filenames:

```text
robert-downey-jr.webp -> Robert Downey Jr
eren_yeager.png -> Eren Yeager
محمد_صلاح.png -> محمد صلاح
```

In the Guess Who lobby, the host can either:

- Randomize a board from selected folders.
- Manually select exact characters from the saved library.

Both players can browse the saved folders and characters in the lobby while waiting for the round to start.

Uploaded Guess Who images are stored in:

```text
public/uploads/guess-who-library/
```

Character and folder metadata is stored in:

```text
data/guess-who-characters.json
```

If you deploy to a host with an ephemeral filesystem, these uploads may disappear after redeploys or restarts. In that case, move uploads to persistent storage such as DigitalOcean Spaces, Cloudinary, S3, Supabase Storage, or a mounted persistent disk.
