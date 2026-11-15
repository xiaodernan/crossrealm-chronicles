FROM eclipse-temurin:21-jre
COPY gateway/target/gateway-0.1.0-SNAPSHOT.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
