const { Vector2D } = require("@georgedoescode/vector2d");
const { random, seedPRNG } = require("@georgedoescode/generative-utils");
const { createSVGWindow } = require("svgdom");
const { SVG, registerWindow } = require("@svgdotjs/svg.js");
const { checkIntersection } = require("line-intersect");
const KDBush = require("kdbush");
const { polygonCentroid } = require("geometric");
const { builder } = require("@netlify/functions");

async function handler(event, context) {
  const urlparts = event.path.split("/");

  const seed = parseInt(urlparts[2]);
  const colorVariant = urlparts[3] || "dark";

  const lineColor = colorVariant === "dark" ? "#151a1e" : "#fff";

  seedPRNG(seed);

  const width = 1024;
  const height = 1024;

  const window = createSVGWindow();
  const document = window.document;

  registerWindow(window, document);

  const svg = SVG(document.documentElement).viewbox(0, 0, width, height);
  const group = svg.group();

  const gradient = svg.gradient("linear", (add) => {
    add.stop(0, "#4E9ABE");
    add.stop(1, "#27C0B8");
  });

  group.rect(width, height).fill(gradient).radius(64);

  const lineWidth = 32;
  const numLines = 5;
  const lines = [];
  const padding = -lineWidth;
  const nodeSize = 128;

  const rect = createRect(width, height, padding);

  for (let i = 0; i < numLines; i++) {
    const line = randomLineOnRect(rect, lines);

    if (line) {
      lines.push(line);
    }
  }

  const intersections = lines.map((l) => l.intersections).flat();

  const index = new KDBush(
    intersections,
    (p) => p.x,
    (p) => p.y,
    64,
    Int32Array
  );

  const intersectionGroups = intersections
    .map((i) => {
      const items = index
        .within(i.x, i.y, nodeSize / 2)
        .map((index) => intersections[index]);

      let center;

      if (items.length === 1) {
        center = new Vector2D(items[0].x, items[0].y);
      } else if (items.length === 2) {
        center = Vector2D.lerp(items[0], items[1], 0.5);
      } else {
        const centroid = polygonCentroid(items.map((p) => [p.x, p.y]));
        center = new Vector2D(centroid[0], centroid[1]);
      }

      return {
        center,
        items,
      };
    })
    .reduce((unique, o) => {
      if (
        !unique.some(
          (obj) => obj.center.x === o.center.x && obj.center.y === o.center.y
        )
      ) {
        unique.push(o);
      }

      return unique;
    }, []);

  lines.forEach((line) => {
    group.line(line.start.x, line.start.y, line.end.x, line.end.y).stroke({
      width: lineWidth,
      color: lineColor,
    });
  });

  intersectionGroups.forEach((g) => {
    group.circle(nodeSize).cx(g.center.x).cy(g.center.y).fill(lineColor);
  });

  group
    .rotate(45, width / 2, height / 2)
    .scale(0.7071)
    .cx(width / 2)
    .cy(height / 2);

  function createRect(width, height, padding = 0) {
    return [
      {
        start: new Vector2D(padding, padding),
        end: new Vector2D(width - padding, padding),
        index: 0,
      },
      {
        start: new Vector2D(width - padding, padding),
        end: new Vector2D(width - padding, height - padding),
        index: 1,
      },
      {
        start: new Vector2D(width - padding, height - padding),
        end: new Vector2D(padding, height - padding),
        index: 2,
      },
      {
        start: new Vector2D(padding, height - padding),
        end: new Vector2D(padding, padding),
        index: 3,
      },
    ];
  }

  function randomLineOnRect(rect, existingLines) {
    let line = null;

    for (let i = 0; i < 25_000; i++) {
      const side1 = random(rect);
      const side2 = random(rect.filter((side) => side.index !== side1.index));

      const start = Vector2D.lerp(side1.start, side1.end, random(0, 1));
      const end = Vector2D.lerp(side2.start, side2.end, random(0, 1));

      const minMidPointDist = 192;
      const midPoint = Vector2D.lerp(start, end, 0.5);

      if (
        midPoint.x <= minMidPointDist ||
        midPoint.y <= minMidPointDist ||
        midPoint.x >= width - minMidPointDist ||
        midPoint.y >= height - minMidPointDist
      ) {
        continue;
      }

      const minOriginDist = 192;

      if (
        existingLines.some(
          (l) =>
            Vector2D.dist(l.start, start) < minOriginDist ||
            Vector2D.dist(l.end, start) < minOriginDist ||
            Vector2D.dist(l.start, end) < minOriginDist ||
            Vector2D.dist(l.end, end) < minOriginDist
        )
      ) {
        continue;
      }

      const allCurrentIntersections = [];
      for (let i = 0; i < existingLines.length; i++) {
        const l = existingLines[i];

        const currentIntersection = checkIntersection(
          start.x,
          start.y,
          end.x,
          end.y,
          l.start.x,
          l.start.y,
          l.end.x,
          l.end.y
        );

        if (currentIntersection.type === "intersecting") {
          allCurrentIntersections.push(
            new Vector2D(
              currentIntersection.point.x,
              currentIntersection.point.y
            )
          );
        }
      }

      let intersectionIsFarEnoughFromEdges = true;
      const minIntersectionDistFromEdges = 192;

      for (let i = 0; i < allCurrentIntersections.length; i++) {
        const currentIntersection = allCurrentIntersections[i];

        if (
          currentIntersection.x < minIntersectionDistFromEdges ||
          currentIntersection.y < minIntersectionDistFromEdges ||
          currentIntersection.x > width - minIntersectionDistFromEdges ||
          currentIntersection.y > height - minIntersectionDistFromEdges
        ) {
          intersectionIsFarEnoughFromEdges = false;

          break;
        }
      }

      if (!intersectionIsFarEnoughFromEdges) {
        continue;
      }

      const allLineIntersections = existingLines
        .map((l) => l.intersections)
        .flat();

      let intersectionsAreFarEnoughFromOtherIntersections = true;

      for (let i = 0; i < allCurrentIntersections.length; i++) {
        for (let j = 0; j < allLineIntersections.length; j++) {
          const dist = Vector2D.dist(
            allCurrentIntersections[i],
            allLineIntersections[j]
          );

          if (dist > nodeSize / 6 && dist < nodeSize * 3) {
            intersectionsAreFarEnoughFromOtherIntersections = false;

            break;
          }
        }
      }

      if (
        !intersectionsAreFarEnoughFromOtherIntersections ||
        (existingLines.length > 0 && allCurrentIntersections.length === 0)
      ) {
        continue;
      }

      line = {
        start,
        end,
        intersections: allCurrentIntersections,
      };

      break;
    }

    return line;
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "image/svg+xml",
    },
    ttl: 604800,
    body: svg.node.outerHTML,
  };
}

exports.handler = builder(handler);
