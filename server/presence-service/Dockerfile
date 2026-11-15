FROM eclipse-temurin:21-jre
COPY presence-service/target/presence-service-0.1.0-SNAPSHOT.jar /app/app.jar
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
