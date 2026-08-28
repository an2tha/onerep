//
//  The one C header Swift needs to see.
//
//  `libneedle.a` is a plain static archive with a four-function C interface and
//  no module map, so Swift cannot `import` it. This bridging header is the
//  supported way in, and it is referenced from Needle.xcconfig rather than
//  clicked into the target so that the setting survives a `cap sync`.
//

#import "needle.h"
