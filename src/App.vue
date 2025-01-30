<template>
  <div class="app">
    <div class="top-bar" v-show="showUI">
      <div class="controls">
        <button class="play-button" @click="togglePlay">
          <img v-if="!isPlaying" src="/play.svg" alt="Play" />
          <img v-else src="/stop.svg" alt="Stop" />
        </button>
        <canvas
          ref="waveformCanvas"
          class="waveform"
          width="100"
          height="20"
        ></canvas>
        <button v-if="!audioStarted" class="start-audio" @click="startAudio">
          Start Audio
        </button>
        <button class="eval-button" @click="evaluateCode">Run</button>
      </div>
      <div class="username-container">
        <input
          v-model="username"
          :class="['username-input', { editing: isEditingUsername }]"
          @keyup.enter="saveUsername"
          @blur="saveUsername"
          @focus="editUsername"
          :placeholder="'set username'"
          ref="usernameInput"
        />
      </div>
      <div class="ip-container">
        <div class="user-color" :style="{ backgroundColor: userColor }"></div>
        <span class="ip-text">{{ myIP }}</span>
      </div>
      <span class="time">{{ time }}</span>

      <button class="help-button" @click="showHelp = true">
        <img src="/help.svg" alt="Help" />
      </button>
    </div>
    <div class="editor">
      <div class="ace-editor-container">
        <div
          ref="editor"
          class="ace-editor"
          style="width: 100%; height: 100%"
        ></div>
      </div>
    </div>
    <div class="user-list" v-show="showUI">
      <div v-for="user in users" :key="user.id" class="user-item">
        <div
          class="user-color"
          :style="{ backgroundColor: user.color }"
          :title="user.ip"
        ></div>
        <span class="username">{{ user.name }}</span>
      </div>
    </div>
    <HelpModal :show="showHelp" @close="showHelp = false" />
  </div>
</template>

<script setup>
import "./style.css";
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { v4 as uuidv4 } from "uuid";
import ace from "ace-builds";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/theme-monokai";
import * as Tone from "tone";
import HelpModal from "./components/HelpModal.vue";

// Active loops and synths for cleanup
const activeLoops = new Map();
const activeSynths = new Map();

// Synth types and their configurations
const synthTypes = {
  pulse: {
    create: () => {
      try {
        const osc = new Tone.PulseOscillator().toDestination();
        osc.volume.value = -12; // Base volume
        return osc;
      } catch (err) {
        console.error("Error creating pulse oscillator:", err);
        return null;
      }
    },
    params: (vol = 1, rate = 1) => {
      try {
        // Clamp values to valid ranges
        const safeVol = Math.max(1, Math.min(9, vol));
        const safeRate = Math.max(1, Math.min(3, rate));
        return {
          volume: (safeVol / 9) * 24 - 12, // Scale 0-9 to -12 to +12 dB
          frequency: safeRate,
        };
      } catch (err) {
        console.error("Error calculating params:", err);
        return {
          volume: -12,
          frequency: 1,
        };
      }
    },
    trigger: async (synth, config, duration) => {
      try {
        // Start audio if not already started
        if (!audioStarted.value) {
          const success = await startAudio();
          if (!success) {
            console.error("Failed to start audio");
            return null;
          }
        }

        // Get audio context and ensure it's running
        const audioContext = Tone.getContext().rawContext;
        if (!audioContext) {
          console.error("Audio context not available");
          return null;
        }

        // Try to resume the context - needed for browsers that require user interaction
        if (audioContext.state === "suspended") {
          try {
            await audioContext.resume();
            console.log("Audio context resumed");
          } catch (err) {
            console.error("Error resuming audio context:", err);
            return null;
          }
        }

        // Wait for the context to be running with timeout
        if (audioContext.state !== "running") {
          try {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error("Timeout waiting for audio context"));
              }, 5000);

              const checkState = () => {
                if (audioContext.state === "running") {
                  clearTimeout(timeout);
                  resolve(true);
                } else {
                  requestAnimationFrame(checkState);
                }
              };
              checkState();
            });
            console.log("Audio context running");
          } catch (err) {
            console.error("Error waiting for audio context:", err);
            return null;
          }
        }

        // Double-check context state after waiting
        if (audioContext.state === "suspended") {
          try {
            await audioContext.resume();
            console.log("Audio context resumed after wait");
          } catch (err) {
            console.error("Error resuming context after wait:", err);
            return null;
          }
        }

        // Wait again for running state
        if (audioContext.state !== "running") {
          try {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error("Timeout waiting for context after resume"));
              }, 5000);

              const checkState = () => {
                if (audioContext.state === "running") {
                  clearTimeout(timeout);
                  resolve(true);
                } else {
                  requestAnimationFrame(checkState);
                }
              };
              checkState();
            });
            console.log("Audio context running after resume");
          } catch (err) {
            console.error("Error waiting for context after resume:", err);
            return null;
          }
        }

        // Set volume
        console.log("Setting synth volume:", config.volume);
        synth.volume.value = config.volume;

        // Create a repeating trigger
        const loop = new Tone.Loop((time) => {
          try {
            synth.start(time).stop(time + 0.1); // 100ms pulse
          } catch (err) {
            console.error("Error in pulse loop:", err);
          }
        }, 1 / config.frequency);

        // Start transport if not running
        if (Tone.Transport.state !== "started") {
          try {
            await Tone.start();
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error("Timeout waiting for transport"));
              }, 5000);

              Tone.Transport.start();
              // Give transport a moment to start
              setTimeout(() => {
                clearTimeout(timeout);
                resolve();
              }, 10);
            });
            console.log("Transport started");
          } catch (err) {
            console.error("Error starting transport:", err);
            return null;
          }
        }

        // Start the loop with a small delay to ensure transport is ready
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Timeout starting loop"));
            }, 5000);

            setTimeout(() => {
              try {
                loop.start(0);
                clearTimeout(timeout);
                resolve();
              } catch (err) {
                console.error("Error starting loop:", err);
                clearTimeout(timeout);
                resolve();
              }
            }, 10);
          });
          console.log("Loop started");
        } catch (err) {
          console.error("Error starting loop:", err);
          return null;
        }

        // Stop after duration
        if (duration) {
          Tone.Transport.scheduleOnce(() => {
            try {
              if (loop) {
                loop.stop();
                loop.dispose();
              }
              if (synth) {
                synth.stop();
                synth.dispose();
              }
            } catch (err) {
              console.error("Error stopping synth:", err);
            }
          }, `+${duration}`);
        }

        // Handle cleanup if something goes wrong
        const cleanup = () => {
          try {
            if (loop) {
              loop.stop();
              loop.dispose();
            }
            if (synth) {
              synth.stop();
              synth.dispose();
            }
          } catch (err) {
            console.error("Error in cleanup:", err);
          }
        };

        // Attach cleanup to both loop and synth
        loop.cleanup = cleanup;
        synth.cleanup = cleanup;

        return loop;
      } catch (err) {
        console.error("Error in trigger function:", err);
        return null;
      }
    },
  },
};

const users = ref([]);
const time = ref("00:00:00");
const isPlaying = ref(false);
const audioStarted = ref(false);

// Add chronometer functionality
const startChronometer = () => {
  let seconds = 0;
  const updateTime = () => {
    seconds++;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    time.value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(secs).padStart(2, "0")}`;
  };
  return setInterval(updateTime, 1000);
};

let chronometerInterval = null;

const code = ref("");
const isEditingUsername = ref(false);
const showUI = ref(true);
const myIP = ref("connecting...");
const showHelp = ref(false);

const userId = ref(uuidv4());
const username = ref(String.fromCharCode(65 + Math.floor(Math.random() * 26)));

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const serverIP =
  window.location.hostname === "localhost"
    ? "localhost:3003"
    : window.location.host;
let ws;
const connectWebSocket = () => {
  ws = new WebSocket(`${protocol}//${serverIP}`);

  ws.onopen = () => {
    console.log("WebSocket connected");
    sendMessage({
      type: "join",
      user: {
        id: userId.value,
        name: username.value || "Anonymous",
        color: userColor.value,
      },
    });
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected, attempting to reconnect...");
    setTimeout(connectWebSocket, 1000);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.type !== "time") {
      console.log("Received message from server:", data);
    }

    if (data.type === "users") {
      users.value = data.users.filter((u) => u.name.trim() !== "");
      const currentUser = users.value.find((u) => u.id === userId.value);
      if (currentUser) {
        myIP.value = currentUser.ip;
        if (!username.value) {
          username.value = currentUser.name;
        }
      }
    }
    if (data.type === "start") {
      isPlaying.value = true;
      chronometerInterval = startChronometer();
    }
    if (data.type === "stop") {
      isPlaying.value = false;
      if (chronometerInterval) {
        clearInterval(chronometerInterval);
        chronometerInterval = null;
      }
      time.value = "00:00:00";
    }
    if (data.type === "synth") {
      console.log("[SYNTH RX]", {
        type: data.type,
        command: data.command,
        source: data.source,
        timestamp: new Date().toISOString(),
      });
      handleSynthCommand(data.command, data.source);
    }
    if (data.type === "message") {
      console.log("Message from node:", data);
      if (data.destination === username.value) {
        console.log(
          `[MSG TO ${username.value}] From ${data.source}:`,
          data.content
        );
      } else if (data.destination === "broadcast") {
        console.log(`[BROADCAST] From ${data.source}:`, data.content);
      } else {
        console.log(
          `[MSG TO ${data.destination}] From ${data.source}:`,
          data.content
        );
      }
    }
  };

  return ws;
};

ws = connectWebSocket();

const togglePlay = async () => {
  try {
    // Start audio if not already started
    if (!audioStarted.value) {
      const success = await startAudio();
      if (!success) {
        console.error("Failed to start audio");
        return;
      }
    }

    // Start audio if not already started
    if (!audioStarted.value) {
      const success = await startAudio();
      if (!success) {
        console.error("Failed to start audio");
        return;
      }
    }

    // Start audio if not already started
    if (!audioStarted.value) {
      const success = await startAudio();
      if (!success) {
        console.error("Failed to start audio");
        return;
      }
    }

    // Get audio context and ensure it's running
    const audioContext = Tone.getContext().rawContext;
    if (!audioContext) {
      console.error("Audio context not available");
      return;
    }

    // Try to resume the context - needed for browsers that require user interaction
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
        console.log("Audio context resumed");
      } catch (err) {
        console.error("Error resuming audio context:", err);
        return;
      }
    }

    // Wait for the context to be running with timeout
    if (audioContext.state !== "running") {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for audio context"));
          }, 5000);

          const checkState = () => {
            if (audioContext.state === "running") {
              clearTimeout(timeout);
              resolve(true);
            } else {
              requestAnimationFrame(checkState);
            }
          };
          checkState();
        });
        console.log("Audio context running");
      } catch (err) {
        console.error("Error waiting for audio context:", err);
        return;
      }
    }

    // Double-check context state after waiting
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
        console.log("Audio context resumed after wait");
      } catch (err) {
        console.error("Error resuming context after wait:", err);
        return;
      }
    }

    // Wait again for running state
    if (audioContext.state !== "running") {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for context after resume"));
          }, 5000);

          const checkState = () => {
            if (audioContext.state === "running") {
              clearTimeout(timeout);
              resolve(true);
            } else {
              requestAnimationFrame(checkState);
            }
          };
          checkState();
        });
        console.log("Audio context running after resume");
      } catch (err) {
        console.error("Error waiting for context after resume:", err);
        return;
      }
    }

    // Double-check context state after waiting
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
        console.log("Audio context resumed after wait");
      } catch (err) {
        console.error("Error resuming context after wait:", err);
        return;
      }
    }

    // Wait again for running state
    if (audioContext.state !== "running") {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for context after resume"));
          }, 5000);

          const checkState = () => {
            if (audioContext.state === "running") {
              clearTimeout(timeout);
              resolve(true);
            } else {
              requestAnimationFrame(checkState);
            }
          };
          checkState();
        });
        console.log("Audio context running after resume");
      } catch (err) {
        console.error("Error waiting for context after resume:", err);
        return;
      }
    }

    try {
      // Toggle play state
      isPlaying.value = !isPlaying.value;
      if (isPlaying.value) {
        chronometerInterval = startChronometer();
      } else {
        if (chronometerInterval) {
          clearInterval(chronometerInterval);
          chronometerInterval = null;
        }
        time.value = "00:00:00";
      }

      // Send message to server
      sendMessage({ type: isPlaying.value ? "start" : "stop" });
    } catch (err) {
      console.error("Error toggling play state:", err);
      isPlaying.value = false;
      if (chronometerInterval) {
        clearInterval(chronometerInterval);
        chronometerInterval = null;
      }
      time.value = "00:00:00";
    }
  } catch (err) {
    console.error("Error toggling play state:", err);
  }
};

const evaluateCode = async () => {
  try {
    // Start audio if not already started
    if (!audioStarted.value) {
      const success = await startAudio();
      if (!success) {
        console.error("Failed to start audio");
        return;
      }
    }

    // Get audio context and ensure it's running
    const audioContext = Tone.getContext().rawContext;
    if (!audioContext) {
      console.error("Audio context not available");
      return;
    }

    // Try to resume the context - needed for browsers that require user interaction
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
        console.log("Audio context resumed");
      } catch (err) {
        console.error("Error resuming audio context:", err);
        return;
      }
    }

    // Wait for the context to be running with timeout
    if (audioContext.state !== "running") {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for audio context"));
          }, 5000);

          const checkState = () => {
            if (audioContext.state === "running") {
              clearTimeout(timeout);
              resolve(true);
            } else {
              requestAnimationFrame(checkState);
            }
          };
          checkState();
        });
        console.log("Audio context running");
      } catch (err) {
        console.error("Error waiting for audio context:", err);
        return;
      }
    }

    // Double-check context state after waiting
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
        console.log("Audio context resumed after wait");
      } catch (err) {
        console.error("Error resuming context after wait:", err);
        return;
      }
    }

    // Wait again for running state
    if (audioContext.state !== "running") {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for context after resume"));
          }, 5000);

          const checkState = () => {
            if (audioContext.state === "running") {
              clearTimeout(timeout);
              resolve(true);
            } else {
              requestAnimationFrame(checkState);
            }
          };
          checkState();
        });
        console.log("Audio context running after resume");
      } catch (err) {
        console.error("Error waiting for context after resume:", err);
        return;
      }
    }

    const selectedText = aceEditor.getSelectedText();
    const codeToEvaluate = selectedText || aceEditor.getValue();
    console.log("Evaluating code:", codeToEvaluate);

    // Split multiple commands and process each one
    const commands = codeToEvaluate
      .split("\n")
      .map((cmd) => cmd.trim())
      .filter(
        (cmd) =>
          cmd &&
          !cmd.startsWith("//") &&
          !cmd.startsWith("/*") &&
          !cmd.startsWith("*/")
      )
      .join("\n")
      .split(/[\n;]/)
      .map((cmd) => cmd.trim())
      .filter(Boolean);

    console.log("Processing commands:", commands);

    for (const cmd of commands) {
      addToHistory(cmd);
      sendSynthCommand(cmd);
      // Small delay between commands to ensure proper timing
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch (err) {
    console.error("Error evaluating code:", err);
  }
};

const startAudio = async () => {
  try {
    const audioContext = Tone.getContext().rawContext;
    if (!audioContext) {
      console.error("Audio context not available");
      return false;
    }

    // Try to resume the context - needed for browsers that require user interaction
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
        console.log("Audio context resumed");
      } catch (err) {
        console.error("Error resuming audio context:", err);
        return false;
      }
    }

    // Wait for the context to be running with timeout
    if (audioContext.state !== "running") {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for audio context"));
          }, 5000);

          const checkState = () => {
            if (audioContext.state === "running") {
              clearTimeout(timeout);
              resolve(true);
            } else {
              requestAnimationFrame(checkState);
            }
          };
          checkState();
        });
        console.log("Audio context running");
      } catch (err) {
        console.error("Error waiting for audio context:", err);
        return false;
      }
    }

    try {
      // Start Tone.js with user interaction
      await Tone.start();
      console.log("Tone.js started");

      // Double-check context state after start
      if (audioContext.state === "suspended") {
        try {
          await audioContext.resume();
          console.log("Audio context resumed after start");
        } catch (err) {
          console.error("Error resuming context after start:", err);
          return false;
        }
      }

      // Wait again for running state
      if (audioContext.state !== "running") {
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Timeout waiting for context after start"));
            }, 5000);

            const checkState = () => {
              if (audioContext.state === "running") {
                clearTimeout(timeout);
                resolve(true);
              } else {
                requestAnimationFrame(checkState);
              }
            };
            checkState();
          });
          console.log("Audio context running after start");
        } catch (err) {
          console.error("Error waiting for context after start:", err);
          return false;
        }
      }

      // Ensure transport is stopped initially
      if (Tone.Transport.state === "started") {
        Tone.Transport.stop();
      }

      // Update UI state
      audioStarted.value = true;
      console.log("Audio started successfully");

      // Setup waveform after audio is ready
      await setupWaveform();

      // Re-send join message to ensure we're properly connected
      sendMessage({
        type: "join",
        user: {
          id: userId.value,
          name: username.value || "Anonymous",
          color: userColor.value,
        },
      });

      return true;
    } catch (err) {
      console.error("Error starting Tone.js:", err);
      return false;
    }
  } catch (err) {
    console.error("Error starting audio:", err);
    return false;
  }
};

const handleSynthCommand = async (command, source) => {
  try {
    // Get audio context and ensure it's running
    const audioContext = Tone.getContext().rawContext;
    if (!audioContext) {
      console.error("Audio context not available");
      return;
    }

    // Try to resume the context - needed for browsers that require user interaction
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
        console.log("Audio context resumed");
      } catch (err) {
        console.error("Error resuming audio context:", err);
        return;
      }
    }

    // Wait for the context to be running with timeout
    if (audioContext.state !== "running") {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for audio context"));
          }, 5000);

          const checkState = () => {
            if (audioContext.state === "running") {
              clearTimeout(timeout);
              resolve(true);
            } else {
              requestAnimationFrame(checkState);
            }
          };
          checkState();
        });
        console.log("Audio context running");
      } catch (err) {
        console.error("Error waiting for audio context:", err);
        return;
      }
    }

    // Parse command with flexible format
    let match = command
      .trim()
      .match(
        /^(\w+)\s*(?:\(?\s*([\d.,\s]*?)\s*\)?)?(?:\s*\.\s*(\d+(?:\.\d+)?)?s)?(?:\s*\.\s*(\w+))?$/
      );
    if (!match) {
      console.warn("Synth command format invalid:", command);
      return;
    }

    const [_, type, paramsStr, duration, dest] = match;
    const params = paramsStr
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map(Number);
    const targetUser = dest || "local";
    const durationSecs = duration ? parseFloat(duration) : null;

    // Only process if we're the target or it's local
    if (targetUser === "local" || targetUser === username.value) {
      if (type in synthTypes) {
        const synth = synthTypes[type].create();
        if (!synth) {
          console.error("Failed to create synth");
          return;
        }

        const config = synthTypes[type].params(...params);
        if (!config) {
          console.error("Failed to get synth params");
          synth.dispose();
          return;
        }

        const synthKey = `${source || userId.value}_${Date.now()}`;

        try {
          // Clean up any existing synths/loops with this key
          if (activeSynths.has(synthKey)) {
            const oldSynth = activeSynths.get(synthKey);
            if (oldSynth) {
              try {
                oldSynth.stop();
                oldSynth.dispose();
              } catch (err) {
                console.error("Error cleaning up old synth:", err);
              }
              activeSynths.delete(synthKey);
            }
          }
          if (activeLoops.has(synthKey)) {
            const oldLoop = activeLoops.get(synthKey);
            if (oldLoop) {
              try {
                oldLoop.stop();
                oldLoop.dispose();
              } catch (err) {
                console.error("Error cleaning up old loop:", err);
              }
              activeLoops.delete(synthKey);
            }
          }

          activeSynths.set(synthKey, synth);
        } catch (err) {
          console.error("Error setting up synth:", err);
          synth.dispose();
          return;
        }

        if (synthTypes[type].trigger) {
          const loop = await synthTypes[type].trigger(
            synth,
            config,
            durationSecs
          );
          if (loop) activeLoops.set(synthKey, loop);
        } else {
          Object.entries(config).forEach(([key, value]) => {
            if (key === "volume") {
              synth.volume.value = (value / 9) * 24 - 12;
            } else if (key in synth) {
              synth[key] = value;
            }
          });

          if (synth.start) {
            synth.start();
          } else if (synth.triggerAttack) {
            synth.triggerAttack(config.frequency || 440);
          }

          if (durationSecs) {
            setTimeout(() => {
              try {
                if (synth.cleanup) {
                  synth.cleanup();
                } else {
                  if (synth.stop) synth.stop();
                  if (synth.dispose) synth.dispose();
                }
                activeSynths.delete(synthKey);
              } catch (err) {
                console.error("Error cleaning up timed synth:", err);
              }
            }, durationSecs * 1000);
          }
        }
      }
    } else {
      console.log(
        `Message not for us, but for ${targetUser}, my username is ${username.value}. Ignoring.`
      );
    }
  } catch (err) {
    console.error("Error executing synth command:", err);
  }
};

const sendSynthCommand = (command) => {
  sendMessage({
    type: "synth",
    command,
    source: userId.value,
  });
};

const sendMessage = (message) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.log("WebSocket not ready, message queued:", message);
    // Queue the message to be sent when connection is restored
    setTimeout(() => sendMessage(message), 1000);
  }
};

const editUsername = () => {
  isEditingUsername.value = true;
  nextTick(() => {
    if (usernameInput.value) {
      usernameInput.value.focus();
    }
  });
};

const saveUsername = () => {
  isEditingUsername.value = false;
  if (username.value.trim()) {
    const user = users.value.find((u) => u.id === userId.value);
    if (user) {
      sendMessage({
        type: "update",
        user: {
          id: userId.value,
          name: username.value,
          color: userColor.value,
        },
      });
    } else {
      sendMessage({
        type: "join",
        user: {
          id: userId.value,
          name: username.value,
          color: userColor.value,
        },
      });
    }
  }
};

const editor = ref(null);
const usernameInput = ref(null);
const userColor = ref(`hsl(${Math.random() * 360}, 100%, 50%)`);
let aceEditor = null;
const commandHistory = ref([]);
let historyIndex = ref(-1);
let currentCommand = ref("");

// Waveform visualization
const waveformCanvas = ref(null);
let animationFrame = null;
let analyser = null;

const setupWaveform = async () => {
  try {
    if (!waveformCanvas.value) {
      console.log("Waveform canvas not ready");
      return;
    }

    // Start audio if not already started
    if (!audioStarted.value) {
      const success = await startAudio();
      if (!success) {
        console.error("Failed to start audio");
        return;
      }
    }

    const audioContext = Tone.getContext().rawContext;
    if (!audioContext) {
      console.error("Audio context not available");
      return;
    }

    // Try to resume the context - needed for browsers that require user interaction
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
        console.log("Audio context resumed");
      } catch (err) {
        console.error("Error resuming audio context:", err);
        return;
      }
    }

    // Wait for the context to be running with timeout
    if (audioContext.state !== "running") {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for audio context"));
          }, 5000);

          const checkState = () => {
            if (audioContext.state === "running") {
              clearTimeout(timeout);
              resolve(true);
            } else {
              requestAnimationFrame(checkState);
            }
          };
          checkState();
        });
        console.log("Audio context running");
      } catch (err) {
        console.error("Error waiting for audio context:", err);
        return;
      }
    }

    // Double-check context state after waiting
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
        console.log("Audio context resumed after wait");
      } catch (err) {
        console.error("Error resuming context after wait:", err);
        return;
      }
    }

    // Wait again for running state
    if (audioContext.state !== "running") {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for context after resume"));
          }, 5000);

          const checkState = () => {
            if (audioContext.state === "running") {
              clearTimeout(timeout);
              resolve(true);
            } else {
              requestAnimationFrame(checkState);
            }
          };
          checkState();
        });
        console.log("Audio context running after resume");
      } catch (err) {
        console.error("Error waiting for context after resume:", err);
        return;
      }
    }

    try {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      Tone.getDestination().connect(analyser);

      const canvas = waveformCanvas.value;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.error("Could not get canvas context");
        return;
      }

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const drawWaveform = () => {
        try {
          animationFrame = requestAnimationFrame(drawWaveform);
          analyser.getByteTimeDomainData(dataArray);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.beginPath();
          ctx.strokeStyle = "#ffffff";

          const sliceWidth = canvas.width / analyser.frequencyBinCount;
          let x = 0;

          for (let i = 0; i < analyser.frequencyBinCount; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * canvas.height) / 2;

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }

            x += sliceWidth;
          }

          ctx.stroke();
        } catch (err) {
          console.error("Error in drawWaveform:", err);
          if (animationFrame) {
            cancelAnimationFrame(animationFrame);
          }
        }
      };

      drawWaveform();
      console.log("Waveform visualization started");
    } catch (err) {
      console.error("Error setting up waveform:", err);
    }
  } catch (err) {
    console.error("Error in setupWaveform:", err);
  }
};

const handleKeyDown = async (e) => {
  try {
    if (e.ctrlKey) {
      if (e.key === "p") {
        e.preventDefault();
        await togglePlay();
      } else if (e.key === "0") {
        e.preventDefault();
        // Ensure audio is started before sending reset
        if (!audioStarted.value) {
          const success = await startAudio();
          if (!success) {
            console.error("Failed to start audio");
            return;
          }
        }
        sendMessage({ type: "reset" });
      } else if (e.key === "h") {
        e.preventDefault();
        aceEditor.setValue("");
        aceEditor.clearSelection();
      }
    }
  } catch (err) {
    console.error("Error handling key press:", err);
  }
};

onMounted(async () => {
  try {
    // Initialize editor first

    try {
      const editorElement = editor.value;
      aceEditor = ace.edit(editorElement);
      aceEditor.on("change", () => {
        code.value = aceEditor.getValue();
      });
      aceEditor.setTheme("ace/theme/monokai");
      aceEditor.session.setMode("ace/mode/javascript");
      aceEditor.setValue(
        `// Welcome! Press Alt+Enter to evaluate
// Format: pulse(volume, rate).duration
// - volume: 1-9 (quiet to loud)
// - rate: 1-3 (slow to fast)
// - duration: time in seconds

pulse(${Math.floor(Math.random() * 9) + 1}, ${
          Math.floor(Math.random() * 3) + 1
        }).${Math.floor(Math.random() * 5)}s`
      );

      aceEditor.setOptions({
        fontSize: window.innerWidth < 600 ? "16px" : "20px",
        showPrintMargin: false,
        showGutter: false,
        wrap: true,
        tabSize: 2,
        useWorker: true,
        mode: "ace/mode/text",
        enableBasicAutocompletion: false,
        enableLiveAutocompletion: false,
        enableSnippets: false,
        showLineNumbers: false,
        highlightActiveLine: false,
        displayIndentGuides: false,
      });

      // Disable syntax highlighting for comments
      aceEditor.session.setMode("ace/mode/text");

      // Add Alt+Enter command
      aceEditor.commands.addCommand({
        name: "evaluateCode",
        bindKey: { win: "Alt-Enter", mac: "Alt-Enter" },
        exec: evaluateCode,
      });

      window.addEventListener("keydown", handleKeyDown);
    } catch (err) {
      console.error("Error initializing editor:", err);
    }

    // Initialize audio context only if needed
    try {
      const audioContext = Tone.getContext().rawContext;
      if (audioContext.state === "suspended") {
        console.log("Audio context suspended - waiting for user interaction");
      } else {
        // Try to start audio if context is already running
        const success = await startAudio();
        if (success) {
          console.log("Audio started automatically");
        }
      }
    } catch (err) {
      console.error("Error initializing audio context:", err);
    }
  } catch (err) {
    console.error("Error in onMounted:", err);
  }
});

onUnmounted(() => {
  try {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    if (analyser) {
      try {
        analyser.disconnect();
      } catch (err) {
        console.error("Error disconnecting analyser:", err);
      }
    }
    if (aceEditor) {
      aceEditor.destroy();
    }
    if (chronometerInterval) {
      clearInterval(chronometerInterval);
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    window.removeEventListener("keydown", handleKeyDown);

    // Clean up any active synths and loops
    activeSynths.forEach((synth) => {
      try {
        if (synth.cleanup) {
          synth.cleanup();
        } else {
          if (synth.stop) synth.stop();
          if (synth.dispose) synth.dispose();
        }
      } catch (err) {
        console.error("Error cleaning up synth:", err);
      }
    });
    activeLoops.forEach((loop) => {
      try {
        if (loop.cleanup) {
          loop.cleanup();
        } else {
          if (loop.stop) loop.stop();
          if (loop.dispose) loop.dispose();
        }
      } catch (err) {
        console.error("Error cleaning up loop:", err);
      }
    });
    try {
      if (Tone.Transport.state === "started") {
        Tone.Transport.stop();
        Tone.Transport.dispose();
      }
      Tone.getDestination().dispose();
    } catch (err) {
      console.error("Error cleaning up Tone.js:", err);
    }
  } catch (err) {
    console.error("Error in cleanup:", err);
  }
});

const addToHistory = (content) => {
  if (
    content.trim() &&
    commandHistory.value[commandHistory.value.length - 1] !== content
  ) {
    commandHistory.value.push(content);
    historyIndex.value = commandHistory.value.length;
  }
};
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: black;
}

.top-bar {
  display: flex;
  align-items: center;
  padding: 10px;
  color: white;
  background-color: rgba(0, 0, 0, 0.8);
  z-index: 1000;
  flex-wrap: nowrap;
  gap: 8px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.waveform {
  height: 20px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.start-audio,
.eval-button {
  background: #4caf50;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.eval-button {
  background: #2196f3;
}

.play-button,
.help-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-right: 10px;
}

.play-button img,
.help-button img {
  height: 20px;
}

.help-button {
  margin-left: 10px;
}

.username-container {
  margin-left: auto;
  margin-right: 10px;
  cursor: pointer;
}

.username-input {
  background: transparent;
  border: none;
  color: white;
  font-size: 0.8em;
  padding: 2px 5px;
  outline: none;
  width: 120px;
}

.username-input.editing {
  background: rgba(50, 50, 50, 0.8);
  border-radius: 4px;
}

.user-color {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  margin-right: 5px;
  position: relative;
}

.ip-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 10px;
}

.ip-text {
  font-size: 12px;
  color: #aaa;
  min-width: 80px;
}

.time {
  margin-right: 10px;
  font-size: 0.8em;
}

.editor {
  flex-grow: 1;
  overflow: hidden;
  height: 100%;
  background-color: transparent;
}

.ace-editor-container {
  width: 100%;
  height: 100%;
  background-color: transparent;
}

.ace-editor {
  background-color: transparent;
}

:deep(.ace_gutter),
:deep(.ace_content),
:deep(.ace_scroller) {
  background-color: transparent !important;
}

.user-list {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.8rem;
  border-radius: 8px;
  background-color: rgba(0, 0, 0, 0.8);
  z-index: 1000;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: white;
}

@media (max-width: 600px) {
  .editor {
    -webkit-user-select: text;
    user-select: text;
    -webkit-tap-highlight-color: transparent;
    padding: 8px;
  }

  .ace_content {
    padding: 8px;
    font-size: 16px !important;
  }

  .ace_text-input {
    position: relative !important;
    width: 100% !important;
    height: 100% !important;
    opacity: 1 !important;
    background: transparent !important;
    -webkit-appearance: none;
  }

  .ace_editor {
    font-size: 16px !important;
  }

  .ace_scroller {
    margin: 0 !important;
    padding: 0 !important;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .waveform {
    flex: 1;
    max-width: 80px;
  }

  .top-bar {
    padding: 4px;
    font-size: 0.8em;
  }

  .username-container {
    margin: 0 4px;
  }

  .username-input {
    width: 80px;
  }

  .ip-container {
    margin: 0 4px;
  }

  .time {
    margin: 0 4px;
  }

  .play-button img,
  .help-button img {
    height: 16px;
  }

  .start-audio,
  .eval-button {
    padding: 2px 4px;
    font-size: 10px;
  }
}
</style>
