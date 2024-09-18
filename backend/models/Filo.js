
class Filo {
    #items = [];
    #size = 10;
    #tail = 0;
    #head = 0;
    #curr = 0;
    constructor(size) {
        this.#size = size;
    }

    push(value) {
        this.#items[this.#head] = value;
        this.#head++;
        if (this.#head == this.#size) this.#head = 0;
        if (this.#head == this.#tail) {
            this.#tail++;
            if (this.#tail == this.#size) this.#tail = 0
        }
    }

    *iterator() {
        let i = this.#tail
        while(i !== this.#head) {
            yield this.#items[i++];
            if (i == this.#size) i = 0;
        }
    }
    
    *newValues() {
        while(this.#curr !== this.#head) {
            yield this.#items[this.#curr++];
            if (this.#curr == this.#size) this.#curr = 0;
        }
    }
}

module.exports = Filo