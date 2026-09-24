import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      status: "ok",
      service: "hotel-chicago-api",
      timestamp: new Date().toISOString(),
    };
  }
}
