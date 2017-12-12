/**
* Program controls and events.
*/
//% weight=10 color="#31bca3" icon="\uf110" advanced=true
namespace control {

    /**
     * Display an error code and stop the program.
     * @param code an error number to display. eg: 5
     */
    //% help=control/panic weight=29
    //% blockId="control_panic" block="panic %code"
    //% shim=pxtrt::panic
    export function panic(code: number) { }

    /**
     * Display an error code and stop the program when the assertion is `false`.
     */
    //% help=control/assert weight=30
    //% blockId="control_assert" block="assert %cond|with value %code"
    export function assert(cond: boolean, code: number) {
        if (!cond) {
            fail("Assertion failed, code=" + code)
        }
    }

    export function fail(message: string) {
        serial.writeString("Fatal failure: ")
        serial.writeString(message)
        serial.writeString("\r\n")
        panic(108)
    }

    export class AnimationQueue {
        running: boolean;
        eventID: number;
        public interval: number;

        constructor() {
            this.running = false;
            this.eventID = control.allocateNotifyEvent();
            this.interval = 1;
        }

        /**
         * Runs 'render' in a loop until it returns false or the 'stop' function is called
         */
        runUntilDone(render: () => boolean) {
            const evid = this.eventID;

            // if other animation, wait for turn
            if (this.running)
                control.waitForEvent(DAL.DEVICE_ID_NOTIFY, evid);

            // check if the animation hasn't been cancelled since we've waiting
            if (this.isCancelled(evid))
                return;

            // run animation
            this.running = true;
            while (this.running
                && !this.isCancelled(evid)
                && render()) {
                loops.pause(this.interval);
            }

            // check if the animation hasn't been cancelled since we've been waiting
            if (this.isCancelled(evid))
                return;

            // we're done
            this.running = false;
            // unblock 1 fiber
            control.raiseEvent(DAL.DEVICE_ID_NOTIFY_ONE, this.eventID);
        }

        isCancelled(evid: number) {
            return this.eventID !== evid;
        }

        /**
         * Cancels the current running animation and clears the queue
         */
        cancel() {
            if (this.running) {
                this.running = false;
                const evid = this.eventID;
                this.eventID = control.allocateNotifyEvent();
                // unblock fibers
                control.raiseEvent(DAL.DEVICE_ID_NOTIFY, evid);
            }
        }
    }

    class PollEvent {
        public eid: number;
        public vid: number;
        public start: number;
        public timeOut: number;
        public condition: () => boolean;
        public once: boolean;
        constructor(eid: number, vid: number, start: number, timeOut: number, condition: () => boolean, once: boolean) {
            this.eid = eid;
            this.vid = vid;
            this.start = start;
            this.timeOut = timeOut;
            this.condition = condition;
            this.once = once;
        }
    }

    let _pollEventQueue: PollEvent[] = undefined;

    function pollEvents() {
        while (_pollEventQueue.length > 0) {
            const now = control.millis();
            for (let i = 0; i < _pollEventQueue.length; ++i) {
                const ev = _pollEventQueue[i];
                if (ev.condition() || (ev.timeOut > 0 && now - ev.start > ev.timeOut)) {
                    control.raiseEvent(ev.eid, ev.vid);
                    if (ev.once) {
                        _pollEventQueue.splice(i, 1);
                        --i;
                    }
                }
            }
            loops.pause(50);
        }
        // release fiber
        _pollEventQueue = undefined;
    }

    export function __queuePollEvent(timeOut: number, condition: () => boolean, handler: () => void) {
        const ev = new PollEvent(
            control.allocateNotifyEvent(),
            1,
            control.millis(),
            timeOut,
            condition,
            !handler
        );

        // start polling fiber if needed
        if (!_pollEventQueue) {
            _pollEventQueue = [ev];
            control.runInBackground(pollEvents);
        }
        else {
            // add to the queue
            _pollEventQueue.push(ev)
        }

        // register event
        if (handler)
            control.onEvent(ev.eid, ev.vid, handler);
        else // or wait
            control.waitForEvent(ev.eid, ev.vid);
    }
}

/**
 * Busy wait for a condition to be true
 * @param condition condition to test for
 * @param timeOut if positive, maximum duration to wait for in milliseconds
 */
//% blockId="pxt_pause_until"
function pauseUntil(condition: () => boolean, timeOut?: number): void {
    if (!condition || condition()) return; // optimistic path
    if (!timeOut) timeOut = 0;
    control.__queuePollEvent(timeOut, condition, undefined);
}

/**
 * Tagged hex literal converter
 */
//% shim=@hex
function hex(lits: any, ...args: any[]): Buffer { return null }