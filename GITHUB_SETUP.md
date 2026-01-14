# GitHub Setup Guide

## What We Just Did

### Step 1: Initialize Git Repository ✅
```bash
git init
```
**What this does:**
- Creates a new Git repository in your project folder
- Git is a version control system that tracks changes to your code
- Think of it like a "save history" for your project
- This creates a hidden `.git` folder that stores all the version history

### Step 2: Add All Files ✅
```bash
git add .
```
**What this does:**
- The `.` means "all files in the current directory"
- This tells Git to "stage" (prepare) all files for committing
- Files listed in `.gitignore` are automatically excluded (like `node_modules`, `.env.local`)
- Your files are now ready to be saved in Git history

### Step 3: Create Initial Commit ✅
```bash
git commit -m "Initial commit: Next.js business website checker app"
```
**What this does:**
- Creates a "commit" (a snapshot of your code at this moment)
- The `-m` flag lets you add a message describing what this commit contains
- This is like saving a checkpoint in a game - you can always come back to this version
- Your code is now saved in Git's history

## Next Steps: Push to GitHub

### Step 4: Create a GitHub Repository

**You need to do this on GitHub's website:**

1. **Go to GitHub**: https://github.com
2. **Sign in** (or create an account if you don't have one)
3. **Click the "+" icon** in the top right corner
4. **Select "New repository"**
5. **Fill in the details:**
   - **Repository name**: `business-website-checker` (or any name you like)
   - **Description**: "Next.js app to find businesses and check if they have websites"
   - **Visibility**: Choose Public or Private
   - **DO NOT** check "Initialize with README" (we already have files)
   - **DO NOT** add .gitignore or license (we already have them)
6. **Click "Create repository"**

### Step 5: Connect Your Local Repository to GitHub

After creating the repository, GitHub will show you commands. Use these:

**Replace `YOUR_USERNAME` with your actual GitHub username:**

```bash
# Add GitHub as a remote (a place to push your code)
git remote add origin https://github.com/YOUR_USERNAME/business-website-checker.git

# Rename the default branch to 'main' (GitHub's standard)
git branch -M main

# Push your code to GitHub
git push -u origin main
```

**What each command does:**

1. **`git remote add origin ...`**
   - Connects your local Git repository to the GitHub repository
   - "origin" is a nickname for your GitHub repository
   - This tells Git where to send your code when you push

2. **`git branch -M main`**
   - Renames your branch from "master" to "main"
   - This is GitHub's preferred branch name
   - `-M` means "move/rename" the branch

3. **`git push -u origin main`**
   - `push` sends your code to GitHub
   - `-u` sets up tracking so future pushes are easier
   - `origin` is the GitHub repository we just connected
   - `main` is the branch we're pushing
   - This uploads all your code to GitHub

### Step 6: Verify on GitHub

After pushing, refresh your GitHub repository page. You should see all your files!

## Future Workflow

Once set up, here's how to update your code on GitHub:

```bash
# 1. Make changes to your files

# 2. Stage the changes
git add .

# 3. Commit with a message
git commit -m "Describe what you changed"

# 4. Push to GitHub
git push
```

## Troubleshooting

### If you get "authentication failed":
- GitHub requires authentication
- You may need to use a Personal Access Token instead of password
- Or set up SSH keys (more advanced)

### If you get "repository not found":
- Check that the repository name matches exactly
- Make sure you created the repository on GitHub first
- Verify your username is correct

### If you want to change the remote URL:
```bash
# Remove the old remote
git remote remove origin

# Add the correct one
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
```

## Summary

✅ Git repository initialized
✅ Files added and committed
⏳ **Next**: Create GitHub repository and push code

Follow Step 4 and Step 5 above to complete the setup!
