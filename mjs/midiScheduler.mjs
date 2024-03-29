import {delta2sec} from 'https://rpgen3.github.io/piano/mjs/midi/sec2delta.mjs';
import {ArrayAdvancer} from 'https://rpgen3.github.io/nsx39/mjs/ArrayAdvancer.mjs';
import {UstTempoMessage} from 'https://rpgen3.github.io/nsx39/mjs/UstTempoMessage.mjs';
export const midiScheduler = new class {
    constructor() {
        this.midiOutput = null;
        this.isStopping = false;
        this.id = -1;
        this.startedTime = 0;
        this.speedRate = 1;
        this.duration = 0;
        this.scheduledTime = 500;
        this.shiftedNoteOffTime = 1;
    }
    load({tempos, midiNotes}) {
        for (const v of midiNotes) {
            if (v.velocity === 0) {
                v.when -= this.shiftedNoteOffTime;
            }
        }
        const shiftedTempos = tempos.slice(1).concat(new UstTempoMessage({when: Infinity}));
        this.midiNotes = new ArrayAdvancer(midiNotes || []);
        let startDeltaTime = 0;
        let startMilliSecond = 0;
        const toMilliSecond = (bpm, when) => delta2sec({
            bpm,
            delta: when - startDeltaTime
        }) * 1000;
        for (const [i, {bpm}] of tempos.entries()) {
            const {when} = shiftedTempos[i];
            while(!this.midiNotes.done && this.midiNotes.head.when < when) {
                this.midiNotes.head.when = (toMilliSecond(bpm, this.midiNotes.head.when) + startMilliSecond) / this.speedRate + this.scheduledTime;
                this.midiNotes.advance();
            }
            startMilliSecond += toMilliSecond(bpm, when);
            startDeltaTime = when;
        }
        this.duration = Math.max(...[midiNotes].filter(v => v?.length).map(v => v[v.length - 1]).map(v => v.when));
    }
    #init() {
        this.midiNotes.done = false;
        this.startedTime = performance.now();
    }
    #update() {
        const now = performance.now();
        const when = now - this.startedTime + this.scheduledTime;
        while (!this.midiNotes.done && this.midiNotes.head.when < when) {
            const data = this.midiNotes.head;
            const timestamp = data.when + this.startedTime;
            this.midiOutput.noteOn({data, timestamp});
            this.midiNotes.advance();
        }
    }
    async play() {
        if (this.isStopping) return;
        await this.stop();
        this.#init();
        this.id = setInterval(() => this.#update());
    }
    async stop() {
        if (this.isStopping) return;
        this.isStopping = true;
        clearInterval(this.id);
        return new Promise(resolve => {
            const id = setInterval(() => this.midiOutput.allChannels.allNotesOff());
            setTimeout(() => {
                clearInterval(id);
                this.isStopping = false;
                resolve();
            }, this.scheduledTime);
        });
    }
}();
