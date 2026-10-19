Git_Leet_Git

Chrome extension that pushes every Accepted LeetCode submission to a GitHub repo:
- Commit 1: the solution file
- Commit 2: stats (runtime, memory, percentiles) appended to a per-problem `stats.md`

## Install
1. Open `chrome://extensions` and turn on Developer mode.
2. Click Load unpacked and select this folder.
3. Click the LC Sync icon, enter your GitHub token, repo (`user/repo`) and branch, then press Test connection and Save.

Use a fine-grained GitHub token with Contents: Read and write on the solutions repo only.
The token is stored in your browser, never in these files.
