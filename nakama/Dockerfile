# Optional: bake runtime into a custom image for cloud deploys.
# Default local dev uses heroiclabs/nakama + volume mount of ./modules from repo root.
FROM heroiclabs/nakama:3.24.0
COPY modules/*.js /nakama/data/modules/
