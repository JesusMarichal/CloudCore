"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StackRegistry = void 0;
const common_1 = require("@nestjs/common");
const node_stack_1 = require("./node.stack");
let StackRegistry = class StackRegistry {
    constructor(nodeStack) {
        this.stacks = new Map();
        this.register(nodeStack);
    }
    register(stack) {
        this.stacks.set(stack.id, stack);
    }
    get(id) {
        const stack = this.stacks.get(id);
        if (!stack) {
            throw new common_1.BadRequestException(`Stack no soportado: '${id}'`);
        }
        return stack;
    }
};
exports.StackRegistry = StackRegistry;
exports.StackRegistry = StackRegistry = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [node_stack_1.NodeStack])
], StackRegistry);
//# sourceMappingURL=stack.registry.js.map