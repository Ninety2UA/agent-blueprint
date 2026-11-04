# The Docker sandbox image (KTD7): eve's default image, which has git and python3, plus gh.
# eve builds this file during preparation when AB_SANDBOX is docker; Vercel Sandbox and
# Daytona install the same tools in their prepare step instead. The tag is the one eve
# 0.86.0 pins for its default image; check it when eve is upgraded.
FROM ghcr.io/vercel/eve:dockerfile-fc0279bf1664

USER root
RUN apt-get update -qq \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*
USER vercel-sandbox
