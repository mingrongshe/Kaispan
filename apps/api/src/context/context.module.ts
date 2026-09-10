import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ContextService } from "./context.service";
import { SessionGuard } from "./session.guard";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [ContextService, SessionGuard],
  exports: [ContextService, SessionGuard],
})
export class ContextModule {}
