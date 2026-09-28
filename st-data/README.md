# ScreenTinker helper

This folder contains helper files for starting the adjacent ScreenTinker app that lives one directory above this repository at `../screentinker/server`.

The main launcher is:

- `start-screentinker.bat`

It changes into the ScreenTinker server directory and runs:

```powershell
npm start
```

This is a convenience wrapper for the separate signage app. The main PTZ project documentation remains in the repository root `README.md`.
