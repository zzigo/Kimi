# KIMI Synth

![Vue.js](https://img.shields.io/badge/Vue.js-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![Tone.js](https://img.shields.io/badge/Tone.js-F734D7?style=for-the-badge&logo=javascript&logoColor=white)

KIMI is a research project developed by Luciano Azzigotti in conjunction with the doctoral dissertation "Speculative Organology" within the Specialized Master and PhD in Music Performance Research programme at the Hochschule der Künste Bern.

## 🎹 Features

- Real-time interactive audio synthesis
- Network-synchronized playback
- Multiple synthesis types
- Compact command format
- User-to-user sound routing

## 🔠 Command Format

Each command follows this structure:

```
synthType(param1,param2,...).duration.destination
```

- `synthType` → Type of synthesis (pulse, fm, am, karplus, etc.)
- `param1, param2, ...` → Encoded parameters (frequency, modulation, etc.)
- `duration` _(optional, default = infinite)_ → Duration of the sound event
- `destination` _(optional, default = local)_ → User to send the command to

### ✅ Command Examples

```
pulse(4,1).4s.kimi     → Play pulse at vol=4, 1Hz for 4s, locally
fm(3,5,2)              → FM synth, vol=3, modIndex=5, ratio=2, locally
am(2,0.5,1).2s         → AM synth, vol=2, depth=0.5, ratio=1 for 2s
karplus(5,20)          → Karplus-Strong pluck, vol=5, decay=20ms
noise(6,white).3s      → White noise, vol=6 for 3s
grain(3,2,5)           → Granular synth, vol=3, speed=2, density=5
```

## 🧩 Synth Types

| **Synth Type**     | **Command Format**           | **Parameters**                                |
| ------------------ | ---------------------------- | --------------------------------------------- |
| **Pulse**          | `pulse(vol, rate)`           | Volume (0-9), Rate in Hz                      |
| **FM Synth**       | `fm(vol, modIndex, ratio)`   | Volume, Modulation intensity, Frequency ratio |
| **AM Synth**       | `am(vol, depth, ratio)`      | Volume, Modulation depth, Frequency ratio     |
| **Karplus-Strong** | `karplus(vol, decay)`        | Volume, Decay time in ms                      |
| **Noise**          | `noise(vol, type)`           | Volume, Type (white/pink/brown)               |
| **Grain**          | `grain(vol, speed, density)` | Volume, Playback rate, Grains per second      |

## ⌨️ Keyboard Shortcuts

- **Ctrl+Enter**: Evaluate command
- **Ctrl+P**: Play/Stop chronometer
- **Ctrl+0**: Reset chronometer
- **Ctrl+H**: Clear text

## 🔌 Network Features

- Real-time command broadcasting
- User-to-user targeting
- Synchronized playback
- User presence and status

## 🏗️ Technologies

- **Vue.js** - Frontend framework
- **Vite** - Build tool and dev server
- **WebSocket** - Real-time communication
- **Tone.js** - Audio synthesis
- **Ace Editor** - Code editor

## 🎯 Planned Features

- Spatial audio management
- Timeline synchronization
- Enhanced visual feedback
- More synthesis types

## 📝 License

This project is part of academic research at the Hochschule der Künste Bern.
