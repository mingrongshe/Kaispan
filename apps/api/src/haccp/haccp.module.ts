import { Module } from "@nestjs/common";
import { HaccpController } from "./haccp.controller";

@Module({ controllers: [HaccpController] })
export class HaccpModule {}
