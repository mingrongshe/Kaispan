import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AccessModule } from "./access/access.module";
import { AuthModule } from "./auth/auth.module";
import { ContextModule } from "./context/context.module";
import { HaccpModule } from "./haccp/haccp.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    PrismaModule,
    ContextModule,
    AccessModule,
    AuthModule,
    HaccpModule,
  ],
})
export class AppModule {}
