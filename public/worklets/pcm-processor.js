class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    
    const channelData = input[0];
    this.port.postMessage(channelData);
    
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);