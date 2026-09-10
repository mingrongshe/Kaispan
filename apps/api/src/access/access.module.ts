import { Global, Module } from "@nestjs/common";
import { AccessService } from "./access.service";
import { HaccpAccessGuard } from "./haccp-access.guard";

@Global()
@Module({
  providers: [AccessService, HaccpAccessGuard],
  exports: [AccessService, HaccpAccessGuard],
})
export class AccessModule {}
