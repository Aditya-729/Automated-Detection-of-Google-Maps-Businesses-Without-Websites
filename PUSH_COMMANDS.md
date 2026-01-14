# Commands to Push to GitHub

## Replace These Values:

- `YOUR_USERNAME` = Your GitHub username (e.g., "johndoe")
- `REPO_NAME` = Your repository name (e.g., "business-website-checker")

## Run These Commands:

```bash
# 1. Connect your local repository to GitHub
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# 2. Rename branch to 'main' (GitHub's standard)
git branch -M main

# 3. Push your code to GitHub
git push -u origin main
```

## What Each Command Does:

1. **`git remote add origin ...`**
   - Connects your local Git repository to your GitHub repository
   - "origin" is a nickname for your GitHub repository
   - This tells Git where to send your code

2. **`git branch -M main`**
   - Renames your branch from "master" to "main"
   - This matches GitHub's standard branch name

3. **`git push -u origin main`**
   - Uploads all your code to GitHub
   - The `-u` flag sets up tracking for future pushes
   - After this, you can just use `git push` for future updates

## Authentication:

When you run `git push`, GitHub will ask for authentication:
- **Option 1**: Use a Personal Access Token (recommended)
  - Go to GitHub → Settings → Developer settings → Personal access tokens
  - Create a token with "repo" permissions
  - Use the token as your password when prompted

- **Option 2**: Use GitHub Desktop (easier for beginners)
  - Download from: https://desktop.github.com
  - It handles authentication automatically

## After Pushing:

Refresh your GitHub repository page - you should see all your files!
