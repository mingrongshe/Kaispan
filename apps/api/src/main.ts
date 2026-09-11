import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://127.0.0.1:3000", credentials: true });

  const config = new DocumentBuilder().setTitle("KaiSpan HACCP API").setVersion("0.1.0").build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));

  // 本地默认只听回环，别把开发中的接口暴露到局域网。
  // 容器里必须听 0.0.0.0，否则端口映射进不来 —— 镜像里设了 HOST=0.0.0.0。
  await app.listen(Number(process.env.PORT ?? 3001), process.env.HOST ?? "127.0.0.1");
}

void bootstrap();
