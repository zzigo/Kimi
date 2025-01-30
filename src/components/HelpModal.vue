<template>
  <div v-if="show" class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <svg class="kimi-logo" width="100" height="100" viewBox="0 0 100 100">
          <!-- Mayan Kimi symbol (simplified) -->
          <path
            d="M50 10 C30 10 10 30 10 50 C10 70 30 90 50 90 C70 90 90 70 90 50 C90 30 70 10 50 10 M50 20 C60 20 70 30 70 50 C70 70 60 80 50 80 C40 80 30 70 30 50 C30 30 40 20 50 20"
            fill="white"
          />
          <circle cx="50" cy="50" r="5" fill="black" />
        </svg>
        <h2>KIMI Synth</h2>
      </div>

      <div class="modal-body">
        <p class="description">
          KIMI is a research project developed by Luciano Azzigotti in
          conjunction with the doctoral dissertation "Speculative Organology"
          within the Specialized Master and PhD in Music Performance Research
          programme at the Hochschule der Künste Bern.
        </p>

        <h3>Command Format</h3>
        <pre>synthType(param1,param2,...).duration.destination</pre>

        <div class="synth-types">
          <h3>Synth Types</h3>
          <div class="synth-grid">
            <div class="synth-type">
              <h4>Pulse Wave</h4>
              <pre>pulse(volume, frequency).duration</pre>
              <p>Example: pulse(4,1).4s.kimi</p>
            </div>
            <div class="synth-type">
              <h4>FM Synthesis</h4>
              <pre>fm(volume, modIndex, ratio)</pre>
              <p>Example: fm(3,5,2)</p>
            </div>
            <div class="synth-type">
              <h4>AM Synthesis</h4>
              <pre>am(volume, depth, ratio).duration</pre>
              <p>Example: am(2,0.5,1).2s</p>
            </div>
            <div class="synth-type">
              <h4>Karplus-Strong</h4>
              <pre>karplus(volume, decay)</pre>
              <p>Example: karplus(5,20)</p>
            </div>
            <div class="synth-type">
              <h4>Noise Generator</h4>
              <pre>noise(volume, type).duration</pre>
              <p>Example: noise(6,white).3s</p>
            </div>
            <div class="synth-type">
              <h4>Granular Synthesis</h4>
              <pre>grain(volume, speed, density)</pre>
              <p>Example: grain(3,2,5)</p>
            </div>
          </div>
        </div>

        <div class="parameters">
          <h3>Parameters</h3>
          <ul>
            <li><strong>volume</strong>: Output level (0-10)</li>
            <li><strong>frequency</strong>: In Hertz</li>
            <li><strong>modIndex</strong>: FM modulation intensity</li>
            <li><strong>ratio</strong>: Frequency ratio for FM/AM</li>
            <li><strong>depth</strong>: AM modulation depth</li>
            <li><strong>decay</strong>: Decay time in ms</li>
            <li><strong>type</strong>: Noise type (white/pink/brown)</li>
            <li><strong>speed</strong>: Grain playback rate</li>
            <li><strong>density</strong>: Grains per second</li>
          </ul>
        </div>

        <div class="shortcuts">
          <h3>Keyboard Shortcuts</h3>
          <ul>
            <li><strong>Ctrl+Enter</strong>: Evaluate command</li>
            <li><strong>Ctrl+P</strong>: Play/Stop chronometer</li>
            <li><strong>Ctrl+0</strong>: Reset chronometer</li>
            <li><strong>Ctrl+H</strong>: Clear text</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  show: Boolean,
});

defineEmits(["close"]);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: #1a1a1a;
  color: white;
  padding: 2rem;
  border-radius: 8px;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.kimi-logo {
  width: 60px;
  height: 60px;
}

h2 {
  margin: 0;
  font-size: 2rem;
}

h3 {
  margin: 1.5rem 0 1rem;
  color: #00ff9d;
}

h4 {
  margin: 0.5rem 0;
  color: #00b7ff;
}

.description {
  font-style: italic;
  color: #aaa;
  line-height: 1.6;
  margin-bottom: 2rem;
}

pre {
  background: #2a2a2a;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-family: monospace;
  overflow-x: auto;
}

.synth-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin: 1rem 0;
}

.synth-type {
  background: #2a2a2a;
  padding: 1rem;
  border-radius: 4px;
}

.synth-type pre {
  background: #3a3a3a;
  margin: 0.5rem 0;
}

.synth-type p {
  margin: 0.5rem 0;
  color: #00ff9d;
  font-family: monospace;
}

ul {
  list-style: none;
  padding: 0;
}

li {
  margin: 0.5rem 0;
  line-height: 1.4;
}

strong {
  color: #00b7ff;
}

.shortcuts ul {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
}

@media (max-width: 600px) {
  .modal-content {
    margin: 1rem;
    padding: 1rem;
  }

  .synth-grid {
    grid-template-columns: 1fr;
  }
}
</style>
